from __future__ import annotations

import logging
import sqlite3
from datetime import timedelta
from typing import Any

from fastapi import FastAPI, HTTPException, Path, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

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
    FilterCriteria,
    FilterOperator,
    FilterRule,
    DatetimeMetadata,
    NumericMetadata,
    SortDirection,
    SortField,
    VehicleResponse,
    VehicleFilterMetadataResponse,
    VehicleSearchRequest,
    VehicleSearchResponse,
)


app = FastAPI(
    title="The Block API",
    version="1.0.0",
    description="Read-only vehicle inventory API backed by SQLite.",
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


def _build_vehicle_search_response(
    payload: VehicleSearchRequest,
    *,
    extra_clause: tuple[str, list[Any]] | None = None,
) -> VehicleSearchResponse:
    with get_connection() as connection:
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
        query = f"""
            SELECT *
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
            [*parameters, payload.limit, payload.offset],
        ).fetchall()

    vehicles = [
        VehicleResponse(
            **serialize_vehicle(row, auction_start_offset=auction_start_offset)
        )
        for row in rows
    ]
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
        user_exists = connection.execute(
            "SELECT 1 FROM users WHERE user_id = ? LIMIT 1",
            [user_id],
        ).fetchone()

    if user_exists is None:
        raise HTTPException(status_code=404, detail="User not found")

    return _build_vehicle_search_response(
        payload,
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


@app.get("/api/vehicles/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(vehicle_id: str) -> VehicleResponse:
    query = "SELECT * FROM vehicles WHERE id = ? LIMIT 1"

    with get_connection() as connection:
        auction_start_offset = get_auction_start_offset(connection)
        row = connection.execute(query, [vehicle_id]).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return VehicleResponse(
        **serialize_vehicle(row, auction_start_offset=auction_start_offset)
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "The Block API is running"}
