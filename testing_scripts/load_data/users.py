#!/usr/bin/env python3

import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
DATABASE_PATH = DATA_DIR / "vehicles.sqlite"


CREATE_TABLE_SQL = """
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    user_name TEXT NOT NULL
);
"""


INSERT_SQL = """
INSERT INTO users (
    user_id,
    user_name
) VALUES (
    :user_id,
    :user_name
);
"""


USERS = [
    {"user_id": 0, "user_name": "System"},
    {"user_id": 1, "user_name": "Justin"},
]


def main():
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS users;")
        cursor.execute(CREATE_TABLE_SQL)
        cursor.executemany(INSERT_SQL, USERS)
        connection.commit()

        user_count = cursor.execute("SELECT COUNT(*) FROM users;").fetchone()[0]

    print(f"Loaded {user_count} users into {DATABASE_PATH}")


if __name__ == "__main__":
    main()
