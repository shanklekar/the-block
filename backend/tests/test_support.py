from __future__ import annotations

import sqlite3
import tempfile
from contextlib import contextmanager
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import database, main


SCHEMA_SQL = """
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    user_name TEXT NOT NULL
);
CREATE TABLE watching (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    vehicle_id TEXT NOT NULL
);
CREATE UNIQUE INDEX watching_user_vehicle_unique
    ON watching (user_id, vehicle_id);
CREATE TABLE bids (
    vehicle_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    current_bid REAL NOT NULL,
    bid_placed_at TEXT NOT NULL
);
CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    vin TEXT NOT NULL UNIQUE,
    year INTEGER NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    trim TEXT,
    body_style TEXT,
    exterior_color TEXT,
    interior_color TEXT,
    engine TEXT,
    transmission TEXT,
    drivetrain TEXT,
    odometer_km INTEGER,
    fuel_type TEXT,
    condition_grade REAL,
    condition_report TEXT,
    damage_notes TEXT NOT NULL,
    title_status TEXT,
    province TEXT,
    city TEXT,
    auction_start TEXT,
    starting_bid REAL,
    reserve_price REAL,
    buy_now_price REAL,
    images TEXT NOT NULL,
    selling_dealership TEXT,
    lot TEXT
);
CREATE TABLE purchased (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    vehicle_id TEXT NOT NULL UNIQUE,
    purchase_date TIMESTAMP NOT NULL,
    purchase_amount REAL NOT NULL
);
"""


def create_seeded_database(path: Path) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(SCHEMA_SQL)
        connection.executemany(
            "INSERT INTO users (user_id, user_name) VALUES (?, ?)",
            [
                (0, "Hidden Bidder"),
                (1, "Alice"),
                (2, "Bob"),
                (3, "Carla"),
            ],
        )
        connection.executemany(
            """
            INSERT INTO vehicles (
                id, vin, year, make, model, trim, body_style, exterior_color,
                interior_color, engine, transmission, drivetrain, odometer_km,
                fuel_type, condition_grade, condition_report, damage_notes,
                title_status, province, city, auction_start, starting_bid,
                reserve_price, buy_now_price, images, selling_dealership, lot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "veh-started",
                    "VINSTARTED1234567",
                    2022,
                    "Ford",
                    "F-150",
                    "Lariat",
                    "truck",
                    "blue",
                    "black",
                    "3.5L V6",
                    "Automatic",
                    "4x4",
                    32100,
                    "Gasoline",
                    4.5,
                    "Clean",
                    '["Scratch on tailgate"]',
                    "Clean",
                    "ON",
                    "Toronto",
                    "2024-01-01T00:00:00",
                    1000.0,
                    1400.0,
                    5000.0,
                    '["https://example.com/started-1.jpg"]',
                    "Openlane Toronto",
                    "A1",
                ),
                (
                    "veh-future",
                    "VINFUTURE12345678",
                    2023,
                    "Honda",
                    "Civic",
                    "Sport",
                    "sedan",
                    "white",
                    "gray",
                    "2.0L I4",
                    "Automatic",
                    "FWD",
                    8000,
                    "Gasoline",
                    4.8,
                    "Clean",
                    "[]",
                    "Clean",
                    "BC",
                    "Vancouver",
                    "2024-01-02T23:59:59",
                    2000.0,
                    2600.0,
                    6000.0,
                    '["https://example.com/future-1.jpg"]',
                    "Openlane Vancouver",
                    "B2",
                ),
                (
                    "veh-sold",
                    "VINSOLD123456789",
                    2021,
                    "Tesla",
                    "Model 3",
                    "Long Range",
                    "sedan",
                    "red",
                    "white",
                    "Electric",
                    "Automatic",
                    "AWD",
                    12000,
                    "Electric",
                    4.9,
                    "Clean",
                    '["Front bumper touched up"]',
                    "Clean",
                    "AB",
                    "Calgary",
                    "2024-01-01T00:00:00",
                    3000.0,
                    3500.0,
                    7000.0,
                    '["https://example.com/sold-1.jpg"]',
                    "Openlane Calgary",
                    "C3",
                ),
                (
                    "veh-no-buy",
                    "VINNOBUY12345678",
                    2020,
                    "Toyota",
                    "Corolla",
                    "LE",
                    "sedan",
                    "silver",
                    "black",
                    "1.8L I4",
                    "CVT",
                    "FWD",
                    45000,
                    "Gasoline",
                    4.0,
                    "Average",
                    "not-json",
                    "Rebuilt",
                    "MB",
                    "Winnipeg",
                    "2024-01-01T06:00:00",
                    1500.0,
                    1800.0,
                    0.0,
                    '["https://example.com/no-buy-1.jpg"]',
                    "Openlane Winnipeg",
                    "D4",
                ),
            ],
        )
        connection.executemany(
            """
            INSERT INTO bids (vehicle_id, user_id, current_bid, bid_placed_at)
            VALUES (?, ?, ?, ?)
            """,
            [
                ("veh-started", 2, 1200.0, "2026-07-18T10:00:00"),
                ("veh-sold", 1, 3500.0, "2026-07-18T11:00:00"),
            ],
        )
        connection.executemany(
            "INSERT INTO watching (user_id, vehicle_id) VALUES (?, ?)",
            [
                (1, "veh-started"),
                (1, "veh-future"),
                (2, "veh-started"),
            ],
        )
        connection.execute(
            """
            INSERT INTO purchased (user_id, vehicle_id, purchase_date, purchase_amount)
            VALUES (?, ?, ?, ?)
            """,
            (1, "veh-sold", "2026-07-18T12:30:00", 7000.0),
        )
        connection.commit()
    finally:
        connection.close()


class BackendDatabaseTestCase(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "vehicles.sqlite"
        create_seeded_database(self.db_path)
        self._database_path_patcher = patch.object(database, "DATABASE_PATH", self.db_path)
        self._database_path_patcher.start()
        self.addCleanup(self._database_path_patcher.stop)
        self.addCleanup(self._temp_dir.cleanup)

    @contextmanager
    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()


class BackendApiTestCase(BackendDatabaseTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
