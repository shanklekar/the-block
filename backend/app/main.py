from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import get_connection, serialize_vehicle
from .schemas import (
    DATETIME_FIELDS,
    NUMERIC_FIELDS,
    TEXT_FIELDS,
    FilterCriteria,
    FilterOperator,
    FilterRule,
    VehicleResponse,
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


OPERATOR_SQL = {
    FilterOperator.EQ: "= ?",
    FilterOperator.NEQ: "!= ?",
    FilterOperator.LT: "< ?",
    FilterOperator.LTE: "<= ?",
    FilterOperator.GT: "> ?",
    FilterOperator.GTE: ">= ?",
}


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


@app.post("/api/vehicles/search", response_model=VehicleSearchResponse)
def search_vehicles(payload: VehicleSearchRequest) -> VehicleSearchResponse:
    where_clause, parameters = build_where_clause(payload.criteria)
    query = f"""
        SELECT *
        FROM vehicles
        {where_clause}
        ORDER BY auction_start ASC, year DESC, make ASC, model ASC
        LIMIT ?
    """

    with get_connection() as connection:
        rows = connection.execute(query, [*parameters, payload.limit]).fetchall()

    vehicles = [VehicleResponse(**serialize_vehicle(row)) for row in rows]
    return VehicleSearchResponse(
        count=len(vehicles),
        limit=payload.limit,
        vehicles=vehicles,
    )


@app.get("/api/vehicles/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(vehicle_id: str) -> VehicleResponse:
    query = "SELECT * FROM vehicles WHERE id = ? LIMIT 1"

    with get_connection() as connection:
        row = connection.execute(query, [vehicle_id]).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return VehicleResponse(**serialize_vehicle(row))


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "The Block API is running"}
