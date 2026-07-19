#!/usr/bin/env python3

import json
import sqlite3
from datetime import datetime, timedelta
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

CREATE_INDEX_SQL = """
CREATE INDEX bids_vehicle_bid_rank_user_idx
    ON bids (vehicle_id, current_bid DESC, bid_placed_at DESC, user_id);
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


def serialize_bids(vehicle, latest_bid_placed_at):
    current_bid = vehicle.get("current_bid")
    bid_count = int(vehicle.get("bid_count") or 0)
    if current_bid is None or bid_count <= 0:
        return []

    bids = []
    for offset in range(bid_count):
        bid_placed_at = latest_bid_placed_at - timedelta(seconds=bid_count - offset - 1)
        bids.append(
            {
                "vehicle_id": vehicle["id"],
                "user_id": 0,
                "current_bid": current_bid - (100 * (bid_count - offset - 1)),
                "bid_placed_at": bid_placed_at.isoformat(timespec="seconds"),
            }
        )

    return bids


def main():
    vehicles = load_vehicles()
    latest_bid_placed_at = datetime.now()
    bids = []
    for vehicle in vehicles:
        bids.extend(serialize_bids(vehicle, latest_bid_placed_at))

    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS bids;")
        cursor.execute(CREATE_TABLE_SQL)
        cursor.execute(CREATE_INDEX_SQL)
        cursor.executemany(INSERT_SQL, bids)
        connection.commit()

        bid_count = cursor.execute("SELECT COUNT(*) FROM bids;").fetchone()[0]

    print(f"Loaded {bid_count} bids into {DATABASE_PATH}")


if __name__ == "__main__":
    main()
