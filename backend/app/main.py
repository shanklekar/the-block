from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta
from typing import Any

from fastapi import FastAPI, HTTPException, Path, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import (
    get_auction_start_offset,
    get_connection,
    serialize_vehicle,
    shift_auction_start,
)
from .schemas import (
    DATETIME_FIELDS,
    NUMERIC_FIELDS,
    TEXT_FIELDS,
    BidPlacementRequest,
    BidPlacementResponse,
    BiddingStateResponse,
    FilterCriteria,
    FilterOperator,
    FilterRule,
    DatetimeMetadata,
    NumericMetadata,
    PurchaseMutationRequest,
    PurchaseMutationResponse,
    SortDirection,
    SortField,
    VehicleDetailResponse,
    VehicleResponse,
    VehicleFilterMetadataResponse,
    VehicleSearchResult,
    VehicleSearchRequest,
    VehicleSearchResponse,
    WatchingMutationRequest,
    WatchingMutationResponse,
)


app = FastAPI(
    title="The Block API",
    version="1.0.0",
    description="Vehicle inventory API backed by SQLite.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("the_block.api")

BID_INCREMENT = 100.0


class VehicleBiddingConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, vehicle_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(vehicle_id, set()).add(websocket)

    def disconnect(self, vehicle_id: str, websocket: WebSocket) -> None:
        subscribers = self._connections.get(vehicle_id)
        if not subscribers:
            return

        subscribers.discard(websocket)
        if not subscribers:
            self._connections.pop(vehicle_id, None)

    async def broadcast(self, vehicle_id: str, snapshot: BiddingStateResponse) -> None:
        subscribers = list(self._connections.get(vehicle_id, ()))
        if not subscribers:
            return

        disconnected: list[WebSocket] = []
        for websocket in subscribers:
            try:
                await websocket.send_json(snapshot.model_dump())
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(vehicle_id, websocket)


bidding_connection_manager = VehicleBiddingConnectionManager()


FILTER_METADATA_FIELDS = {
    "categorical": [
        "id",
        "vin",
        "make",
        "model",
        "trim",
        "body_style",
        "exterior_color",
        "interior_color",
        "engine",
        "transmission",
        "drivetrain",
        "fuel_type",
        "condition_report",
        "title_status",
        "province",
        "city",
        "selling_dealership",
        "lot",
    ],
    "numeric": sorted(NUMERIC_FIELDS),
    "datetime": sorted(DATETIME_FIELDS),
}


OPERATOR_SQL = {
    FilterOperator.EQ: "= ?",
    FilterOperator.NEQ: "!= ?",
    FilterOperator.LT: "< ?",
    FilterOperator.LTE: "<= ?",
    FilterOperator.GT: "> ?",
    FilterOperator.GTE: ">= ?",
}

SORT_SQL_FIELDS = {
    SortField.AUCTION_START: "auction_start",
    SortField.ODOMETER_KM: "odometer_km",
    SortField.BUY_NOW_PRICE: "buy_now_price",
    SortField.CONDITION_GRADE: "condition_grade",
    SortField.CURRENT_PRICE: "COALESCE(current_bid, starting_bid)",
}


def _shift_datetime_filter_value(value: Any, offset: timedelta) -> Any:
    if isinstance(value, str):
        return shift_auction_start(value, offset)

    if isinstance(value, list):
        return [
            shift_auction_start(item, offset) if isinstance(item, str) else item
            for item in value
        ]

    if isinstance(value, dict):
        shifted_value = value.copy()
        for bound in ("min", "max"):
            bound_value = shifted_value.get(bound)
            if isinstance(bound_value, str):
                shifted_value[bound] = shift_auction_start(bound_value, offset)
        return shifted_value

    return value


def _translate_criteria_to_stored_timeline(
    criteria: FilterCriteria,
    auction_start_offset: timedelta,
) -> FilterCriteria:
    if not criteria.rules:
        return criteria

    translated_criteria = criteria.model_copy(deep=True)

    for rule in translated_criteria.rules:
        if rule.field not in DATETIME_FIELDS or rule.value is None:
            continue

        rule.value = _shift_datetime_filter_value(rule.value, -auction_start_offset)

    return translated_criteria


def _build_rule_clause(rule: FilterRule) -> tuple[str, list[Any]]:
    column = rule.field

    if rule.operator == FilterOperator.IS_NULL:
        return f"{column} IS NULL", []

    if rule.operator == FilterOperator.NOT_NULL:
        return f"{column} IS NOT NULL", []

    if rule.operator in OPERATOR_SQL:
        return f"{column} {OPERATOR_SQL[rule.operator]}", [rule.value]

    if rule.operator == FilterOperator.BETWEEN:
        return f"{column} BETWEEN ? AND ?", [rule.value["min"], rule.value["max"]]

    if rule.operator == FilterOperator.IN:
        placeholders = ", ".join("?" for _ in rule.value)
        return f"{column} IN ({placeholders})", list(rule.value)

    if rule.operator == FilterOperator.CONTAINS:
        return f"LOWER({column}) LIKE LOWER(?)", [f"%{rule.value}%"]

    if rule.operator == FilterOperator.STARTS_WITH:
        return f"LOWER({column}) LIKE LOWER(?)", [f"{rule.value}%"]

    if rule.operator == FilterOperator.ENDS_WITH:
        return f"LOWER({column}) LIKE LOWER(?)", [f"%{rule.value}"]

    raise ValueError(f"Unsupported operator: {rule.operator}")


def build_where_clause(criteria: FilterCriteria) -> tuple[str, list[Any]]:
    if not criteria.rules:
        return "", []

    clauses: list[str] = []
    parameters: list[Any] = []

    for rule in criteria.rules:
        clause, values = _build_rule_clause(rule)
        clauses.append(f"({clause})")
        parameters.extend(values)

    joiner = " AND " if criteria.match.value == "and" else " OR "
    return f"WHERE {joiner.join(clauses)}", parameters


def build_order_clause(sort_by: SortField, sort_direction: SortDirection) -> str:
    sort_expression = SORT_SQL_FIELDS[sort_by]
    direction = "ASC" if sort_direction == SortDirection.ASC else "DESC"

    return (
        "ORDER BY "
        f"CASE WHEN {sort_expression} IS NULL THEN 1 ELSE 0 END ASC, "
        f"{sort_expression} {direction}, "
        "year DESC, make ASC, model ASC, id ASC"
    )


def _combine_where_clauses(*clauses: tuple[str, list[Any]]) -> tuple[str, list[Any]]:
    conditions: list[str] = []
    parameters: list[Any] = []

    for clause, values in clauses:
        if not clause:
            continue

        normalized_clause = clause.removeprefix("WHERE ").strip()
        if not normalized_clause:
            continue

        conditions.append(f"({normalized_clause})")
        parameters.extend(values)

    if not conditions:
        return "", []

    return f"WHERE {' AND '.join(conditions)}", parameters


def _user_exists(connection: sqlite3.Connection, user_id: int) -> bool:
    row = connection.execute(
        "SELECT 1 FROM users WHERE user_id = ? LIMIT 1",
        [user_id],
    ).fetchone()
    return row is not None


def _vehicle_exists(connection: sqlite3.Connection, vehicle_id: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM vehicles WHERE id = ? LIMIT 1",
        [vehicle_id],
    ).fetchone()
    return row is not None


def _get_vehicle_buy_now_price(
    connection: sqlite3.Connection,
    vehicle_id: str,
) -> float | None:
    row = connection.execute(
        "SELECT buy_now_price FROM vehicles WHERE id = ? LIMIT 1",
        [vehicle_id],
    ).fetchone()
    return None if row is None else row["buy_now_price"]


def _parse_datetime_value(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _is_vehicle_sold(connection: sqlite3.Connection, vehicle_id: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM purchased WHERE vehicle_id = ? LIMIT 1",
        [vehicle_id],
    ).fetchone()
    return row is not None


def _get_vehicle_bidding_row(
    connection: sqlite3.Connection,
    vehicle_id: str,
) -> sqlite3.Row | None:
    return connection.execute(
        """
        SELECT
            vehicles.id,
            vehicles.auction_start,
            vehicles.starting_bid,
            vehicles.current_bid,
            vehicles.bid_count,
            EXISTS (
                SELECT 1
                FROM purchased
                WHERE purchased.vehicle_id = vehicles.id
            ) AS is_sold
        FROM vehicles
        WHERE vehicles.id = ?
        LIMIT 1
        """,
        [vehicle_id],
    ).fetchone()


def _get_active_bid_base(row: sqlite3.Row) -> float:
    current_bid = row["current_bid"]
    starting_bid = row["starting_bid"]

    if current_bid is not None:
        return float(current_bid)

    if starting_bid is not None:
        return float(starting_bid)

    return 0.0


def _is_auction_started(
    auction_start: str | None,
    auction_start_offset: timedelta,
) -> bool:
    shifted_auction_start = shift_auction_start(auction_start, auction_start_offset)
    normalized_auction_start = _parse_datetime_value(shifted_auction_start)

    if normalized_auction_start is None:
        return False

    return normalized_auction_start <= datetime.now()


def _build_bidding_state_response(
    row: sqlite3.Row,
    auction_start_offset: timedelta,
) -> BiddingStateResponse:
    active_bid_base = _get_active_bid_base(row)
    return BiddingStateResponse(
        vehicle_id=row["id"],
        auction_started=_is_auction_started(row["auction_start"], auction_start_offset),
        is_sold=bool(row["is_sold"]),
        current_bid=row["current_bid"],
        starting_bid=row["starting_bid"],
        bid_count=row["bid_count"],
        minimum_next_bid=active_bid_base + BID_INCREMENT,
    )


def _load_bidding_state(
    connection: sqlite3.Connection,
    vehicle_id: str,
) -> BiddingStateResponse:
    auction_start_offset = get_auction_start_offset(connection)
    row = _get_vehicle_bidding_row(connection, vehicle_id)

    if row is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return _build_bidding_state_response(row, auction_start_offset)


async def _broadcast_bidding_state(vehicle_id: str) -> None:
    with get_connection() as connection:
        snapshot = _load_bidding_state(connection, vehicle_id)

    await bidding_connection_manager.broadcast(vehicle_id, snapshot)


def _build_is_watched_select(user_id: int | None) -> tuple[str, list[Any]]:
    if user_id is None:
        return "0 AS is_watched", []

    return (
        """
        EXISTS (
            SELECT 1
            FROM watching
            WHERE watching.user_id = ?
              AND watching.vehicle_id = vehicles.id
        ) AS is_watched
        """,
        [user_id],
    )


def _build_is_purchased_select() -> str:
    return """
        EXISTS (
            SELECT 1
            FROM purchased
            WHERE purchased.vehicle_id = vehicles.id
        ) AS is_purchased
    """


def _ensure_vehicle_is_watched(
    connection: sqlite3.Connection,
    *,
    user_id: int,
    vehicle_id: str,
) -> None:
    existing_watch = connection.execute(
        """
        SELECT 1
        FROM watching
        WHERE user_id = ?
          AND vehicle_id = ?
        LIMIT 1
        """,
        [user_id, vehicle_id],
    ).fetchone()

    if existing_watch is not None:
        return

    connection.execute(
        """
        INSERT INTO watching (user_id, vehicle_id)
        VALUES (?, ?)
        """,
        [user_id, vehicle_id],
    )


def _build_vehicle_search_response(
    payload: VehicleSearchRequest,
    *,
    extra_clause: tuple[str, list[Any]] | None = None,
) -> VehicleSearchResponse:
    with get_connection() as connection:
        if payload.user_id is not None and not _user_exists(connection, payload.user_id):
            raise HTTPException(status_code=404, detail="User not found")

        auction_start_offset = get_auction_start_offset(connection)
        translated_criteria = _translate_criteria_to_stored_timeline(
            payload.criteria,
            auction_start_offset,
        )
        criteria_clause = build_where_clause(translated_criteria)
        where_clause, parameters = _combine_where_clauses(
            extra_clause or ("", []),
            criteria_clause,
        )
        order_clause = build_order_clause(payload.sort_by, payload.sort_direction)
        watch_select, watch_parameters = _build_is_watched_select(payload.user_id)
        purchase_select = _build_is_purchased_select()
        query = f"""
            SELECT vehicles.*, {watch_select}, {purchase_select}
            FROM vehicles
            {where_clause}
            {order_clause}
            LIMIT ?
            OFFSET ?
        """
        count_query = f"""
            SELECT COUNT(*) AS total
            FROM vehicles
            {where_clause}
        """
        total_row = connection.execute(count_query, parameters).fetchone()
        rows = connection.execute(
            query,
            [*watch_parameters, *parameters, payload.limit, payload.offset],
        ).fetchall()

    vehicles: list[VehicleSearchResult] = []
    for row in rows:
        vehicle_data = serialize_vehicle(row, auction_start_offset=auction_start_offset)
        vehicle_data["is_watched"] = bool(vehicle_data.get("is_watched"))
        vehicle_data["is_purchased"] = bool(vehicle_data.get("is_purchased"))
        vehicles.append(VehicleSearchResult(**vehicle_data))

    return VehicleSearchResponse(
        count=len(vehicles),
        limit=payload.limit,
        offset=payload.offset,
        total=total_row["total"] if total_row is not None else 0,
        vehicles=vehicles,
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    logger.warning(
        "Validation error for %s %s: %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors())},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if exc.status_code >= 400:
        logger.warning(
            "HTTP error for %s %s: %s",
            request.method,
            request.url.path,
            exc.detail,
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(sqlite3.Error)
async def sqlite_exception_handler(request: Request, exc: sqlite3.Error) -> JSONResponse:
    logger.exception(
        "Database error while handling %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled error while handling %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/vehicles/filters/schema")
def get_filter_schema() -> dict[str, Any]:
    return {
        "format": {
            "match": ["and", "or"],
            "rules": [
                {
                    "field": "make",
                    "operator": "in",
                    "value": ["Ford", "Honda"],
                },
                {
                    "field": "year",
                    "operator": "between",
                    "value": {"min": 2020, "max": 2025},
                },
            ],
        },
        "fields": {
            "text": sorted(TEXT_FIELDS),
            "numeric": sorted(NUMERIC_FIELDS),
            "datetime": sorted(DATETIME_FIELDS),
        },
        "operators": {
            "text": [
                "eq",
                "neq",
                "in",
                "contains",
                "starts_with",
                "ends_with",
                "is_null",
                "not_null",
            ],
            "numeric": [
                "eq",
                "neq",
                "lt",
                "lte",
                "gt",
                "gte",
                "between",
                "in",
                "is_null",
                "not_null",
            ],
            "datetime": [
                "eq",
                "neq",
                "lt",
                "lte",
                "gt",
                "gte",
                "between",
                "in",
                "is_null",
                "not_null",
            ],
        },
    }


@app.get(
    "/api/vehicles/filters/metadata",
    response_model=VehicleFilterMetadataResponse,
)
def get_filter_metadata() -> VehicleFilterMetadataResponse:
    categorical: dict[str, list[str]] = {}
    numeric: dict[str, NumericMetadata] = {}
    datetime: dict[str, DatetimeMetadata] = {}

    with get_connection() as connection:
        auction_start_offset = get_auction_start_offset(connection)

        for field in FILTER_METADATA_FIELDS["categorical"]:
            query = f"""
                SELECT DISTINCT {field}
                FROM vehicles
                WHERE {field} IS NOT NULL AND TRIM(CAST({field} AS TEXT)) != ''
                ORDER BY {field} ASC
            """
            rows = connection.execute(query).fetchall()
            categorical[field] = [str(row[0]) for row in rows]

        for field in FILTER_METADATA_FIELDS["numeric"]:
            row = connection.execute(
                f"SELECT MIN({field}) AS minimum, MAX({field}) AS maximum FROM vehicles"
            ).fetchone()
            numeric[field] = NumericMetadata(min=row["minimum"], max=row["maximum"])

        for field in FILTER_METADATA_FIELDS["datetime"]:
            row = connection.execute(
                f"SELECT MIN({field}) AS minimum, MAX({field}) AS maximum FROM vehicles"
            ).fetchone()
            datetime[field] = DatetimeMetadata(
                min=shift_auction_start(row["minimum"], auction_start_offset),
                max=shift_auction_start(row["maximum"], auction_start_offset),
            )

    return VehicleFilterMetadataResponse(
        categorical=categorical,
        numeric=numeric,
        datetime=datetime,
    )


@app.post("/api/vehicles/search", response_model=VehicleSearchResponse)
def search_vehicles(payload: VehicleSearchRequest) -> VehicleSearchResponse:
    return _build_vehicle_search_response(payload)


@app.post(
    "/api/users/{user_id}/watching/vehicles/search",
    response_model=VehicleSearchResponse,
)
def search_watched_vehicles(
    payload: VehicleSearchRequest,
    user_id: int = Path(..., ge=0),
) -> VehicleSearchResponse:
    with get_connection() as connection:
        user_exists = _user_exists(connection, user_id)

    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found")

    return _build_vehicle_search_response(
        payload.model_copy(update={"user_id": user_id}),
        extra_clause=(
            """
            EXISTS (
                SELECT 1
                FROM watching
                WHERE watching.user_id = ?
                  AND watching.vehicle_id = vehicles.id
            )
            """,
            [user_id],
        ),
    )


@app.post(
    "/api/users/{user_id}/watching",
    response_model=WatchingMutationResponse,
)
def mutate_watching(
    payload: WatchingMutationRequest,
    user_id: int = Path(..., ge=0),
) -> WatchingMutationResponse:
    with get_connection() as connection:
        if not _user_exists(connection, user_id):
            raise HTTPException(status_code=404, detail="User not found")

        if not _vehicle_exists(connection, payload.vehicle_id):
            raise HTTPException(status_code=404, detail="Vehicle not found")

        existing_watch = connection.execute(
            """
            SELECT id
            FROM watching
            WHERE user_id = ?
              AND vehicle_id = ?
            LIMIT 1
            """,
            [user_id, payload.vehicle_id],
        ).fetchone()

        if payload.watch:
            if existing_watch is None:
                connection.execute(
                    """
                    INSERT INTO watching (user_id, vehicle_id)
                    VALUES (?, ?)
                    """,
                    [user_id, payload.vehicle_id],
                )
                connection.commit()
            is_watched = True
        else:
            connection.execute(
                """
                DELETE FROM watching
                WHERE user_id = ?
                  AND vehicle_id = ?
                """,
                [user_id, payload.vehicle_id],
            )
            connection.commit()
            is_watched = False

    return WatchingMutationResponse(
        user_id=user_id,
        vehicle_id=payload.vehicle_id,
        is_watched=is_watched,
    )


@app.get(
    "/api/vehicles/{vehicle_id}/bidding-state",
    response_model=BiddingStateResponse,
)
def get_vehicle_bidding_state(
    vehicle_id: str,
    user_id: int = Query(..., ge=0),
) -> BiddingStateResponse:
    with get_connection() as connection:
        if not _user_exists(connection, user_id):
            raise HTTPException(status_code=404, detail="User not found")

        return _load_bidding_state(connection, vehicle_id)


@app.post(
    "/api/users/{user_id}/vehicles/{vehicle_id}/bids",
    response_model=BidPlacementResponse,
)
async def place_bid(
    payload: BidPlacementRequest,
    user_id: int = Path(..., ge=0),
    vehicle_id: str = Path(..., min_length=1),
) -> BidPlacementResponse:
    bid_placed_at = datetime.now().isoformat(timespec="seconds")

    with get_connection() as connection:
        if not _user_exists(connection, user_id):
            raise HTTPException(status_code=404, detail="User not found")

        try:
            connection.execute("BEGIN IMMEDIATE")
            auction_start_offset = get_auction_start_offset(connection)
            row = _get_vehicle_bidding_row(connection, vehicle_id)

            if row is None:
                raise HTTPException(status_code=404, detail="Vehicle not found")

            bidding_state = _build_bidding_state_response(row, auction_start_offset)
            if bidding_state.is_sold:
                raise HTTPException(status_code=409, detail="Vehicle has already been sold")
            if not bidding_state.auction_started:
                raise HTTPException(status_code=409, detail="Auction has not started")
            if payload.amount < bidding_state.minimum_next_bid:
                raise HTTPException(
                    status_code=409,
                    detail="Bid amount must be at least the minimum next bid",
                )

            next_bid_count = int(row["bid_count"]) + 1
            connection.execute(
                """
                INSERT INTO bids (
                    vehicle_id,
                    user_id,
                    current_bid,
                    bid_placed_at
                ) VALUES (?, ?, ?, ?)
                """,
                [vehicle_id, user_id, payload.amount, bid_placed_at],
            )
            connection.execute(
                """
                UPDATE vehicles
                SET current_bid = ?, bid_count = ?
                WHERE id = ?
                """,
                [payload.amount, next_bid_count, vehicle_id],
            )
            connection.commit()
        except HTTPException:
            connection.rollback()
            raise
        except sqlite3.Error:
            connection.rollback()
            raise

    response = BidPlacementResponse(
        user_id=user_id,
        vehicle_id=vehicle_id,
        amount=payload.amount,
        current_bid=payload.amount,
        bid_count=next_bid_count,
        bid_placed_at=bid_placed_at,
    )
    await _broadcast_bidding_state(vehicle_id)
    return response


@app.websocket("/ws/vehicles/{vehicle_id}/bidding")
async def vehicle_bidding_stream(
    websocket: WebSocket,
    vehicle_id: str,
    user_id: int = Query(..., ge=0),
) -> None:
    with get_connection() as connection:
        if not _user_exists(connection, user_id):
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="User not found",
            )
            return

        row = _get_vehicle_bidding_row(connection, vehicle_id)
        if row is None:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Vehicle not found",
            )
            return

        snapshot = _build_bidding_state_response(
            row,
            get_auction_start_offset(connection),
        )
        if snapshot.is_sold:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Vehicle already sold",
            )
            return
        if not snapshot.auction_started:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Auction has not started",
            )
            return

    await bidding_connection_manager.connect(vehicle_id, websocket)

    try:
        await websocket.send_json(snapshot.model_dump())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        bidding_connection_manager.disconnect(vehicle_id, websocket)


@app.post(
    "/api/users/{user_id}/purchased",
    response_model=PurchaseMutationResponse,
)
async def mutate_purchased(
    payload: PurchaseMutationRequest,
    user_id: int = Path(..., ge=0),
) -> PurchaseMutationResponse:
    purchase_date = datetime.now().isoformat(timespec="seconds")

    with get_connection() as connection:
        if not _user_exists(connection, user_id):
            raise HTTPException(status_code=404, detail="User not found")

        if not _vehicle_exists(connection, payload.vehicle_id):
            raise HTTPException(status_code=404, detail="Vehicle not found")

        vehicle_buy_now_price = _get_vehicle_buy_now_price(connection, payload.vehicle_id)
        if (
            vehicle_buy_now_price is None
            or vehicle_buy_now_price <= 0
            or payload.buy_now_price != vehicle_buy_now_price
        ):
            raise HTTPException(status_code=409, detail="Buy now price does not match")

        existing_purchase = connection.execute(
            """
            SELECT user_id, vehicle_id, purchase_date, purchase_amount
            FROM purchased
            WHERE vehicle_id = ?
            LIMIT 1
            """,
            [payload.vehicle_id],
        ).fetchone()

        if existing_purchase is not None:
            if existing_purchase["user_id"] != user_id:
                raise HTTPException(
                    status_code=409,
                    detail="Vehicle has already been purchased by another user",
                )

            _ensure_vehicle_is_watched(
                connection,
                user_id=user_id,
                vehicle_id=payload.vehicle_id,
            )
            connection.commit()
            response = PurchaseMutationResponse(
                user_id=existing_purchase["user_id"],
                vehicle_id=existing_purchase["vehicle_id"],
                purchase_amount=existing_purchase["purchase_amount"],
                purchase_date=existing_purchase["purchase_date"],
                is_purchased=True,
            )
            await _broadcast_bidding_state(payload.vehicle_id)
            return response

        try:
            _ensure_vehicle_is_watched(
                connection,
                user_id=user_id,
                vehicle_id=payload.vehicle_id,
            )
            connection.execute(
                """
                INSERT INTO purchased (
                    user_id,
                    vehicle_id,
                    purchase_date,
                    purchase_amount
                ) VALUES (?, ?, ?, ?)
                """,
                [user_id, payload.vehicle_id, purchase_date, payload.buy_now_price],
            )
            connection.commit()
        except sqlite3.IntegrityError:
            # A unique vehicle_id constraint protects against duplicate purchases.
            existing_purchase = connection.execute(
                """
                SELECT user_id, vehicle_id, purchase_date, purchase_amount
                FROM purchased
                WHERE vehicle_id = ?
                LIMIT 1
                """,
                [payload.vehicle_id],
            ).fetchone()
            if existing_purchase is None:
                raise
            if existing_purchase["user_id"] != user_id:
                raise HTTPException(
                    status_code=409,
                    detail="Vehicle has already been purchased by another user",
                )

            _ensure_vehicle_is_watched(
                connection,
                user_id=user_id,
                vehicle_id=payload.vehicle_id,
            )
            connection.commit()
            response = PurchaseMutationResponse(
                user_id=existing_purchase["user_id"],
                vehicle_id=existing_purchase["vehicle_id"],
                purchase_amount=existing_purchase["purchase_amount"],
                purchase_date=existing_purchase["purchase_date"],
                is_purchased=True,
            )
            await _broadcast_bidding_state(payload.vehicle_id)
            return response

    response = PurchaseMutationResponse(
        user_id=user_id,
        vehicle_id=payload.vehicle_id,
        purchase_amount=payload.buy_now_price,
        purchase_date=purchase_date,
        is_purchased=True,
    )
    await _broadcast_bidding_state(payload.vehicle_id)
    return response


@app.get("/api/vehicles/{vehicle_id}", response_model=VehicleDetailResponse)
def get_vehicle(
    vehicle_id: str,
    user_id: int | None = Query(default=None, ge=0),
) -> VehicleDetailResponse:
    purchase_select = _build_is_purchased_select()
    select_clause = f"vehicles.*, 0 AS is_watched, {purchase_select}"
    query_parameters: list[Any] = [vehicle_id]

    if user_id is not None:
        select_clause = f"""
            vehicles.*,
            EXISTS (
                SELECT 1
                FROM watching
                WHERE watching.user_id = ?
                  AND watching.vehicle_id = vehicles.id
            ) AS is_watched,
            {purchase_select}
        """
        query_parameters = [user_id, vehicle_id]

    query = f"SELECT {select_clause} FROM vehicles WHERE id = ? LIMIT 1"

    with get_connection() as connection:
        if user_id is not None and not _user_exists(connection, user_id):
            raise HTTPException(status_code=404, detail="User not found")

        auction_start_offset = get_auction_start_offset(connection)
        row = connection.execute(query, query_parameters).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle_data = serialize_vehicle(row, auction_start_offset=auction_start_offset)
    vehicle_data["is_watched"] = bool(vehicle_data.get("is_watched"))
    vehicle_data["is_purchased"] = bool(vehicle_data.get("is_purchased"))
    return VehicleDetailResponse(**vehicle_data)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "The Block API is running"}
