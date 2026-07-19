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
    FilterOption,
    FilterCriteria,
    FilterOperator,
    FilterRule,
    DatetimeMetadata,
    NumericMetadata,
    PurchasedVehicleSearchRequest,
    PurchasedVehicleSearchResponse,
    PurchasedVehicleSearchResult,
    PurchasedVehicleSortField,
    PurchaseMutationRequest,
    PurchaseMutationResponse,
    SortDirection,
    SortField,
    VehicleDetailResponse,
    VehicleResponse,
    VehicleFilterMetadataResponse,
    VehicleFilterOptionsRequest,
    VehicleFilterOptionsResponse,
    VehicleSearchResult,
    VehicleSearchRequest,
    VehicleSearchResponse,
    UserCreateRequest,
    UserSummary,
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
HIDDEN_USER_ID = 0


class VehicleBiddingConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, dict[WebSocket, int]] = {}

    async def connect(self, vehicle_id: str, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(vehicle_id, {})[websocket] = user_id

    def disconnect(self, vehicle_id: str, websocket: WebSocket) -> None:
        subscribers = self._connections.get(vehicle_id)
        if not subscribers:
            return

        subscribers.pop(websocket, None)
        if not subscribers:
            self._connections.pop(vehicle_id, None)

    async def broadcast(self, vehicle_id: str) -> None:
        subscribers = list(self._connections.get(vehicle_id, {}).items())
        if not subscribers:
            return

        with get_connection() as connection:
            auction_start_offset = get_auction_start_offset(connection)
            row = _get_vehicle_bidding_row(connection, vehicle_id)

            if row is None:
                return

        disconnected: list[WebSocket] = []
        for websocket, user_id in subscribers:
            try:
                snapshot = _build_bidding_state_response(
                    row,
                    auction_start_offset,
                    user_id=user_id,
                )
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

SORT_SQL_COLUMNS = {
    SortField.AUCTION_START: "auction_start",
    SortField.ODOMETER_KM: "odometer_km",
    SortField.BUY_NOW_PRICE: "buy_now_price",
    SortField.CONDITION_GRADE: "condition_grade",
}

PURCHASED_SORT_SQL_FIELDS = {
    PurchasedVehicleSortField.PURCHASE_DATE: "purchased.purchase_date",
    PurchasedVehicleSortField.PURCHASE_AMOUNT: "purchased.purchase_amount",
}

PURCHASED_SEARCH_COLUMNS = [
    "CAST(vehicles.year AS TEXT)",
    "vehicles.make",
    "vehicles.model",
    "vehicles.trim",
    "vehicles.body_style",
    "vehicles.engine",
    "vehicles.exterior_color",
    "vehicles.interior_color",
    "vehicles.drivetrain",
    "vehicles.fuel_type",
    "vehicles.city",
    "vehicles.province",
    "vehicles.selling_dealership",
    "vehicles.lot",
    "vehicles.condition_report",
]


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


def _qualify_sql_column(column: str, *, prefix: str = "") -> str:
    return f"{prefix}{column}"


def _build_bid_count_subquery(vehicle_id_reference: str) -> str:
    return f"""
        SELECT COUNT(*)
        FROM bids
        WHERE bids.vehicle_id = {vehicle_id_reference}
    """


def _build_top_bid_value_subquery(vehicle_id_reference: str, column: str) -> str:
    return f"""
        SELECT bids.{column}
        FROM bids
        WHERE bids.vehicle_id = {vehicle_id_reference}
        ORDER BY bids.current_bid DESC, bids.bid_placed_at DESC, bids.rowid DESC
        LIMIT 1
    """


def _build_current_bid_subquery(vehicle_id_reference: str) -> str:
    return _build_top_bid_value_subquery(vehicle_id_reference, "current_bid")


def _build_current_high_bidder_user_id_subquery(vehicle_id_reference: str) -> str:
    return _build_top_bid_value_subquery(vehicle_id_reference, "user_id")


def _build_live_bid_select(*, prefix: str = "") -> str:
    vehicle_id_reference = _qualify_sql_column("id", prefix=prefix)
    return f"""
        ({_build_current_bid_subquery(vehicle_id_reference)}) AS live_current_bid,
        ({_build_bid_count_subquery(vehicle_id_reference)}) AS live_bid_count
    """


def _get_sql_field_expression(field: str, *, prefix: str = "") -> str:
    vehicle_id_reference = _qualify_sql_column("id", prefix=prefix)

    if field == "current_bid":
        return f"({_build_current_bid_subquery(vehicle_id_reference)})"

    if field == "bid_count":
        return f"({_build_bid_count_subquery(vehicle_id_reference)})"

    if field == "bid_amount":
        return "COALESCE({}, {})".format(
            _get_sql_field_expression("current_bid", prefix=prefix),
            _qualify_sql_column("starting_bid", prefix=prefix),
        )

    return _qualify_sql_column(field, prefix=prefix)


def _get_sort_sql_expression(sort_by: SortField, *, prefix: str = "") -> str:
    if sort_by == SortField.CURRENT_PRICE:
        return _get_sql_field_expression("bid_amount", prefix=prefix)

    return _qualify_sql_column(SORT_SQL_COLUMNS[sort_by], prefix=prefix)


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
    column = _get_sql_field_expression(rule.field)

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


def _remove_field_rules(criteria: FilterCriteria, field: str) -> FilterCriteria:
    if not criteria.rules:
        return criteria

    return FilterCriteria(
        match=criteria.match,
        rules=[rule for rule in criteria.rules if rule.field != field],
    )


def _format_filter_option_label(field: str, value: str) -> str:
    normalized_value = value.strip()
    if field in {"body_style", "exterior_color", "interior_color"}:
        return normalized_value[:1].upper() + normalized_value[1:]

    return normalized_value


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


def _build_option_search_clause(field: str, query: str) -> tuple[str, list[Any]]:
    normalized_query = query.strip()

    if not normalized_query:
        return "", []

    column = _get_sql_field_expression(field)
    return f"AND LOWER({column}) LIKE LOWER(?)", [f"%{normalized_query}%"]


def build_order_clause(
    sort_by: SortField,
    sort_direction: SortDirection,
    *,
    group_purchased_last: bool = False,
) -> str:
    sort_expression = _get_sort_sql_expression(sort_by)
    direction = "ASC" if sort_direction == SortDirection.ASC else "DESC"
    order_fields: list[str] = []

    if group_purchased_last:
        order_fields.append("CASE WHEN is_purchased THEN 1 ELSE 0 END ASC")

    order_fields.extend(
        [
            f"CASE WHEN {sort_expression} IS NULL THEN 1 ELSE 0 END ASC",
            f"{sort_expression} {direction}",
            "year DESC",
            "make ASC",
            "model ASC",
            "id ASC",
        ]
    )

    return f"ORDER BY {', '.join(order_fields)}"


def build_purchased_order_clause(
    sort_by: PurchasedVehicleSortField,
    sort_direction: SortDirection,
) -> str:
    sort_expression = PURCHASED_SORT_SQL_FIELDS[sort_by]
    direction = "ASC" if sort_direction == SortDirection.ASC else "DESC"
    order_fields = [
        f"{sort_expression} {direction}",
        "vehicles.year DESC",
        "vehicles.make ASC",
        "vehicles.model ASC",
        "vehicles.id ASC",
    ]
    return f"ORDER BY {', '.join(order_fields)}"


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


def _search_filter_options(
    payload: VehicleFilterOptionsRequest,
    *,
    extra_clause: tuple[str, list[Any]] | None = None,
) -> VehicleFilterOptionsResponse:
    with get_connection() as connection:
        if payload.user_id is not None and not _user_exists(connection, payload.user_id):
            raise HTTPException(status_code=404, detail="User not found")

        criteria_without_target = _remove_field_rules(payload.criteria, payload.field)
        translated_criteria = _translate_criteria_to_stored_timeline(
            criteria_without_target,
            get_auction_start_offset(connection),
        )
        criteria_clause = build_where_clause(translated_criteria)
        where_clause, parameters = _combine_where_clauses(extra_clause or ("", []), criteria_clause)
        option_column = _get_sql_field_expression(payload.field)
        option_search_clause, option_search_parameters = _build_option_search_clause(
            payload.field,
            payload.query,
        )
        base_where_clause = where_clause or "WHERE 1 = 1"
        query = f"""
            SELECT DISTINCT {option_column} AS value
            FROM vehicles
            {base_where_clause}
              AND {option_column} IS NOT NULL
              AND TRIM(CAST({option_column} AS TEXT)) != ''
              {option_search_clause}
            ORDER BY value ASC
            LIMIT ?
        """
        rows = connection.execute(
            query,
            [*parameters, *option_search_parameters, payload.limit],
        ).fetchall()

    return VehicleFilterOptionsResponse(
        field=payload.field,
        options=[
            FilterOption(
                value=str(row["value"]),
                label=_format_filter_option_label(payload.field, str(row["value"])),
            )
            for row in rows
        ],
    )


def _build_purchased_search_clause(search: str) -> tuple[str, list[Any]]:
    normalized_search = search.strip()

    if not normalized_search:
        return "", []

    search_pattern = f"%{normalized_search.lower()}%"
    detail_surface = " || ' ' || ".join(
        f"COALESCE({column}, '')" for column in PURCHASED_SEARCH_COLUMNS
    )

    return (
        f"""
        (
            LOWER(COALESCE(vehicles.vin, '')) LIKE ?
            OR LOWER(TRIM({detail_surface})) LIKE ?
        )
        """,
        [search_pattern, search_pattern],
    )


def _user_exists(connection: sqlite3.Connection, user_id: int) -> bool:
    row = connection.execute(
        "SELECT 1 FROM users WHERE user_id = ? LIMIT 1",
        [user_id],
    ).fetchone()
    return row is not None


def _serialize_user_row(row: sqlite3.Row) -> UserSummary:
    return UserSummary(
        user_id=row["user_id"],
        user_name=row["user_name"],
    )


def _build_user_name_lookup_value(user_name: str) -> str:
    return user_name.strip().lower()


def _visible_user_exists(connection: sqlite3.Connection, user_id: int) -> bool:
    row = connection.execute(
        """
        SELECT 1
        FROM users
        WHERE user_id = ?
          AND user_id != ?
        LIMIT 1
        """,
        [user_id, HIDDEN_USER_ID],
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
        f"""
        SELECT
            vehicles.id,
            vehicles.auction_start,
            vehicles.starting_bid,
            ({_build_current_bid_subquery("vehicles.id")}) AS current_bid,
            ({_build_bid_count_subquery("vehicles.id")}) AS bid_count,
            ({_build_current_high_bidder_user_id_subquery("vehicles.id")}) AS high_bidder_user_id,
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
    *,
    user_id: int | None = None,
) -> BiddingStateResponse:
    active_bid_base = _get_active_bid_base(row)
    high_bidder_user_id = row["high_bidder_user_id"]
    return BiddingStateResponse(
        vehicle_id=row["id"],
        auction_started=_is_auction_started(row["auction_start"], auction_start_offset),
        is_sold=bool(row["is_sold"]),
        current_bid=row["current_bid"],
        starting_bid=row["starting_bid"],
        bid_count=row["bid_count"],
        minimum_next_bid=active_bid_base + BID_INCREMENT,
        is_high_bidder=user_id is not None and high_bidder_user_id == user_id,
    )


def _load_bidding_state(
    connection: sqlite3.Connection,
    vehicle_id: str,
    user_id: int | None = None,
) -> BiddingStateResponse:
    auction_start_offset = get_auction_start_offset(connection)
    row = _get_vehicle_bidding_row(connection, vehicle_id)

    if row is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return _build_bidding_state_response(row, auction_start_offset, user_id=user_id)


async def _broadcast_bidding_state(vehicle_id: str) -> None:
    await bidding_connection_manager.broadcast(vehicle_id)


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


def _build_is_purchased_by_user_select(user_id: int | None) -> tuple[str, list[Any]]:
    if user_id is None:
        return "0 AS is_purchased_by_user", []

    return (
        """
        EXISTS (
            SELECT 1
            FROM purchased
            WHERE purchased.user_id = ?
              AND purchased.vehicle_id = vehicles.id
        ) AS is_purchased_by_user
        """,
        [user_id],
    )


def _build_is_high_bidder_select(user_id: int | None) -> tuple[str, list[Any]]:
    if user_id is None:
        return "0 AS is_high_bidder", []

    return (
        f"""
        COALESCE(
            ({_build_current_high_bidder_user_id_subquery("vehicles.id")}),
            -1
        ) = ? AS is_high_bidder
        """,
        [user_id],
    )


def _build_exclude_purchased_clause() -> tuple[str, list[Any]]:
    return (
        """
        NOT EXISTS (
            SELECT 1
            FROM purchased
            WHERE purchased.vehicle_id = vehicles.id
        )
        """,
        [],
    )


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
    group_purchased_last: bool = False,
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
        order_clause = build_order_clause(
            payload.sort_by,
            payload.sort_direction,
            group_purchased_last=group_purchased_last,
        )
        watch_select, watch_parameters = _build_is_watched_select(payload.user_id)
        purchase_select = _build_is_purchased_select()
        purchased_by_user_select, purchased_by_user_parameters = (
            _build_is_purchased_by_user_select(payload.user_id)
        )
        high_bidder_select, high_bidder_parameters = _build_is_high_bidder_select(
            payload.user_id
        )
        live_bid_select = _build_live_bid_select(prefix="vehicles.")
        query = f"""
            SELECT
                vehicles.*,
                {live_bid_select},
                {watch_select},
                {purchase_select},
                {purchased_by_user_select},
                {high_bidder_select}
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
            [
                *watch_parameters,
                *purchased_by_user_parameters,
                *high_bidder_parameters,
                *parameters,
                payload.limit,
                payload.offset,
            ],
        ).fetchall()

    vehicles: list[VehicleSearchResult] = []
    for row in rows:
        vehicle_data = serialize_vehicle(row, auction_start_offset=auction_start_offset)
        vehicle_data["is_watched"] = bool(vehicle_data.get("is_watched"))
        vehicle_data["is_purchased"] = bool(vehicle_data.get("is_purchased"))
        vehicle_data["is_purchased_by_user"] = bool(
            vehicle_data.get("is_purchased_by_user")
        )
        vehicle_data["is_high_bidder"] = bool(vehicle_data.get("is_high_bidder"))
        vehicles.append(VehicleSearchResult(**vehicle_data))

    return VehicleSearchResponse(
        count=len(vehicles),
        limit=payload.limit,
        offset=payload.offset,
        total=total_row["total"] if total_row is not None else 0,
        vehicles=vehicles,
    )


def _build_purchased_vehicle_search_response(
    payload: PurchasedVehicleSearchRequest,
    *,
    user_id: int,
) -> PurchasedVehicleSearchResponse:
    with get_connection() as connection:
        if not _user_exists(connection, user_id):
            raise HTTPException(status_code=404, detail="User not found")

        auction_start_offset = get_auction_start_offset(connection)
        where_clause, parameters = _combine_where_clauses(
            ("purchased.user_id = ?", [user_id]),
            _build_purchased_search_clause(payload.search),
        )
        order_clause = build_purchased_order_clause(
            payload.sort_by,
            payload.sort_direction,
        )
        live_bid_select = _build_live_bid_select(prefix="vehicles.")
        query = f"""
            SELECT
                vehicles.*,
                {live_bid_select},
                purchased.purchase_date,
                purchased.purchase_amount
            FROM purchased
            INNER JOIN vehicles
                ON vehicles.id = purchased.vehicle_id
            {where_clause}
            {order_clause}
            LIMIT ?
            OFFSET ?
        """
        count_query = f"""
            SELECT COUNT(*) AS total
            FROM purchased
            INNER JOIN vehicles
                ON vehicles.id = purchased.vehicle_id
            {where_clause}
        """
        total_row = connection.execute(count_query, parameters).fetchone()
        rows = connection.execute(
            query,
            [*parameters, payload.limit, payload.offset],
        ).fetchall()

    vehicles: list[PurchasedVehicleSearchResult] = []
    for row in rows:
        vehicle_data = serialize_vehicle(row, auction_start_offset=auction_start_offset)
        vehicles.append(PurchasedVehicleSearchResult(**vehicle_data))

    return PurchasedVehicleSearchResponse(
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


@app.get("/api/users", response_model=list[UserSummary])
def list_users() -> list[UserSummary]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT user_id, user_name
            FROM users
            WHERE user_id != ?
            ORDER BY LOWER(TRIM(user_name)) ASC, user_id ASC
            """,
            [HIDDEN_USER_ID],
        ).fetchall()

    return [_serialize_user_row(row) for row in rows]


@app.post("/api/users", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest) -> UserSummary:
    normalized_user_name = _build_user_name_lookup_value(payload.user_name)

    with get_connection() as connection:
        duplicate_user = connection.execute(
            """
            SELECT user_id
            FROM users
            WHERE user_id != ?
              AND LOWER(TRIM(user_name)) = ?
            LIMIT 1
            """,
            [HIDDEN_USER_ID, normalized_user_name],
        ).fetchone()

        if duplicate_user is not None:
            raise HTTPException(status_code=409, detail="User name already exists")

        cursor = connection.execute(
            """
            INSERT INTO users (user_name)
            VALUES (?)
            """,
            [payload.user_name],
        )
        connection.commit()
        created_user_id = cursor.lastrowid

        if created_user_id is None or not _visible_user_exists(connection, created_user_id):
            raise HTTPException(status_code=500, detail="Unable to create user")

        row = connection.execute(
            """
            SELECT user_id, user_name
            FROM users
            WHERE user_id = ?
            LIMIT 1
            """,
            [created_user_id],
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=500, detail="Unable to create user")

    return _serialize_user_row(row)


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
            numeric_expression = _get_sql_field_expression(field)
            row = connection.execute(
                f"SELECT MIN({numeric_expression}) AS minimum, MAX({numeric_expression}) AS maximum FROM vehicles"
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


@app.post(
    "/api/vehicles/filters/options",
    response_model=VehicleFilterOptionsResponse,
)
def search_filter_options(
    payload: VehicleFilterOptionsRequest,
) -> VehicleFilterOptionsResponse:
    return _search_filter_options(payload)


@app.post(
    "/api/users/{user_id}/watching/vehicles/filters/options",
    response_model=VehicleFilterOptionsResponse,
)
def search_watched_filter_options(
    payload: VehicleFilterOptionsRequest,
    user_id: int = Path(..., ge=0),
) -> VehicleFilterOptionsResponse:
    with get_connection() as connection:
        user_exists = _user_exists(connection, user_id)

    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found")

    return _search_filter_options(
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


@app.post("/api/vehicles/search", response_model=VehicleSearchResponse)
def search_vehicles(payload: VehicleSearchRequest) -> VehicleSearchResponse:
    return _build_vehicle_search_response(
        payload,
        extra_clause=_build_exclude_purchased_clause(),
    )


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
        extra_clause=_combine_where_clauses(
            (
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
            _build_exclude_purchased_clause(),
        ),
        group_purchased_last=True,
    )


@app.post(
    "/api/users/{user_id}/purchased/vehicles/search",
    response_model=PurchasedVehicleSearchResponse,
)
def search_purchased_vehicles(
    payload: PurchasedVehicleSearchRequest,
    user_id: int = Path(..., ge=0),
) -> PurchasedVehicleSearchResponse:
    return _build_purchased_vehicle_search_response(payload, user_id=user_id)


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

        return _load_bidding_state(connection, vehicle_id, user_id=user_id)


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
            if row["high_bidder_user_id"] == user_id:
                raise HTTPException(
                    status_code=409,
                    detail="You already hold the highest bid",
                )
            if payload.amount < bidding_state.minimum_next_bid:
                raise HTTPException(
                    status_code=409,
                    detail="Bid amount must be at least the minimum next bid",
                )

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
            _ensure_vehicle_is_watched(
                connection,
                user_id=user_id,
                vehicle_id=vehicle_id,
            )
            connection.commit()
            bidding_state = _load_bidding_state(connection, vehicle_id, user_id=user_id)
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
        current_bid=bidding_state.current_bid or payload.amount,
        bid_count=bidding_state.bid_count,
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
            user_id=user_id,
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

    await bidding_connection_manager.connect(vehicle_id, user_id, websocket)

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
    purchased_by_user_select, purchased_by_user_parameters = (
        _build_is_purchased_by_user_select(user_id)
    )
    high_bidder_select, high_bidder_parameters = _build_is_high_bidder_select(user_id)
    live_bid_select = _build_live_bid_select(prefix="vehicles.")
    select_clause = (
        "vehicles.*, "
        f"{live_bid_select}, 0 AS is_watched, {purchase_select}, {purchased_by_user_select}, {high_bidder_select}"
    )
    query_parameters: list[Any] = [vehicle_id]

    if user_id is not None:
        select_clause = f"""
            vehicles.*,
            {live_bid_select},
            EXISTS (
                SELECT 1
                FROM watching
                WHERE watching.user_id = ?
                  AND watching.vehicle_id = vehicles.id
            ) AS is_watched,
            {purchase_select},
            {purchased_by_user_select},
            {high_bidder_select}
        """
        query_parameters = [
            user_id,
            *purchased_by_user_parameters,
            *high_bidder_parameters,
            vehicle_id,
        ]
    else:
        query_parameters = [
            *purchased_by_user_parameters,
            *high_bidder_parameters,
            vehicle_id,
        ]

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
    vehicle_data["is_purchased_by_user"] = bool(vehicle_data.get("is_purchased_by_user"))
    vehicle_data["is_high_bidder"] = bool(vehicle_data.get("is_high_bidder"))
    return VehicleDetailResponse(**vehicle_data)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "The Block API is running"}
