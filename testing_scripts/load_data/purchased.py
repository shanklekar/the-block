#!/usr/bin/env python3

import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
DATABASE_PATH = DATA_DIR / "vehicles.sqlite"


CREATE_TABLE_SQL = """
CREATE TABLE purchased (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    vehicle_id TEXT NOT NULL UNIQUE,
    purchase_date TIMESTAMP NOT NULL,
    purchase_amount REAL NOT NULL
);
"""


def main():
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS purchased;")
        cursor.execute(CREATE_TABLE_SQL)
        connection.commit()

        purchased_count = cursor.execute("SELECT COUNT(*) FROM purchased;").fetchone()[0]

    print(f"Loaded {purchased_count} purchased records into {DATABASE_PATH}")


if __name__ == "__main__":
    main()
