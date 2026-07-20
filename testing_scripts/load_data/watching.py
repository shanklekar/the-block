#!/usr/bin/env python3

import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
DATABASE_PATH = DATA_DIR / "vehicles.sqlite"


CREATE_TABLE_SQL = """
CREATE TABLE watching (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    vehicle_id TEXT NOT NULL
);
CREATE UNIQUE INDEX watching_user_vehicle_unique
    ON watching (user_id, vehicle_id);
"""


def main():
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS watching;")
        cursor.executescript(CREATE_TABLE_SQL)
        connection.commit()

        watching_count = cursor.execute("SELECT COUNT(*) FROM watching;").fetchone()[0]

    print(f"Loaded {watching_count} watching records into {DATABASE_PATH}")


if __name__ == "__main__":
    main()
