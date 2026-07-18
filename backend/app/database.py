from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


REPO_ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = REPO_ROOT / "data" / "vehicles.sqlite"


def _parse_json_column(value: str | None) -> list[Any]:
    if not value:
        return []

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []

    return parsed if isinstance(parsed, list) else []


def serialize_vehicle(row: sqlite3.Row) -> dict[str, Any]:
    vehicle = dict(row)
    vehicle["damage_notes"] = _parse_json_column(vehicle.get("damage_notes"))
    vehicle["images"] = _parse_json_column(vehicle.get("images"))
    return vehicle


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    try:
        yield connection
    finally:
        connection.close()
