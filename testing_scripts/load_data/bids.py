#!/usr/bin/env python3

import json
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
SOURCE_JSON_PATH = DATA_DIR / "vehicles.json"
DATABASE_PATH = DATA_DIR / "vehicles.sqlite"


CREATE_TABLE_SQL = """
CREATE TABLE bids (
    vehicle_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    current_bid REAL NOT NULL,
    bid_placed_at TEXT NOT NULL
);
"""


INSERT_SQL = """
INSERT INTO bids (
    vehicle_id,
    user_id,
    current_bid,
    bid_placed_at
) VALUES (
    :vehicle_id,
    :user_id,
    :current_bid,
    :bid_placed_at
);
"""


def load_vehicles():
    with SOURCE_JSON_PATH.open("r", encoding="utf-8") as source_file:
        return json.load(source_file)


def serialize_bid(vehicle, bid_placed_at):
    return {
        "vehicle_id": vehicle["id"],
        "user_id": 0,
        "current_bid": vehicle["current_bid"],
        "bid_placed_at": bid_placed_at,
    }


def main():
    vehicles = load_vehicles()
    bid_placed_at = datetime.now().isoformat(timespec="seconds")
    bids = [
        serialize_bid(vehicle, bid_placed_at)
        for vehicle in vehicles
        if vehicle.get("current_bid") is not None
    ]

    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS bids;")
        cursor.execute(CREATE_TABLE_SQL)
        cursor.executemany(INSERT_SQL, bids)
        connection.commit()

        bid_count = cursor.execute("SELECT COUNT(*) FROM bids;").fetchone()[0]

    print(f"Loaded {bid_count} bids into {DATABASE_PATH}")


if __name__ == "__main__":
    main()
