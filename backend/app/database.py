from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
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


def _parse_datetime_column(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def get_auction_start_offset(connection: sqlite3.Connection) -> timedelta:
    row = connection.execute(
        """
        SELECT MIN(auction_start) AS minimum
        FROM vehicles
        WHERE auction_start IS NOT NULL AND TRIM(auction_start) != ''
        """
    ).fetchone()

    oldest_auction_start = row["minimum"] if row is not None else None
    oldest_timestamp = _parse_datetime_column(oldest_auction_start)
    if oldest_timestamp is None:
        return timedelta()

    return timedelta(days=(date.today() - oldest_timestamp.date()).days)


def shift_auction_start(value: str | None, offset: timedelta) -> str | None:
    timestamp = _parse_datetime_column(value)
    if timestamp is None:
        return value

    return (timestamp + offset).isoformat(timespec="seconds")


def serialize_vehicle(
    row: sqlite3.Row,
    *,
    auction_start_offset: timedelta | None = None,
) -> dict[str, Any]:
    vehicle = dict(row)
    if "live_current_bid" in vehicle:
        vehicle["current_bid"] = vehicle.pop("live_current_bid")
    if "live_bid_count" in vehicle:
        vehicle["bid_count"] = vehicle.pop("live_bid_count")
    vehicle.pop("reserve_price", None)
    vehicle["damage_notes"] = _parse_json_column(vehicle.get("damage_notes"))
    vehicle["images"] = _parse_json_column(vehicle.get("images"))
    if auction_start_offset is not None:
        vehicle["auction_start"] = shift_auction_start(
            vehicle.get("auction_start"),
            auction_start_offset,
        )
    return vehicle


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    try:
        yield connection
    finally:
        connection.close()
