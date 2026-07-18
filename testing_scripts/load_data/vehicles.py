#!/usr/bin/env python3

import json
import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
SOURCE_JSON_PATH = DATA_DIR / "vehicles.json"
DATABASE_PATH = DATA_DIR / "vehicles.sqlite"


CREATE_TABLE_SQL = """
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
    lot TEXT,
    current_bid REAL,
    bid_count INTEGER NOT NULL
);
"""


INSERT_SQL = """
INSERT INTO vehicles (
    id,
    vin,
    year,
    make,
    model,
    trim,
    body_style,
    exterior_color,
    interior_color,
    engine,
    transmission,
    drivetrain,
    odometer_km,
    fuel_type,
    condition_grade,
    condition_report,
    damage_notes,
    title_status,
    province,
    city,
    auction_start,
    starting_bid,
    reserve_price,
    buy_now_price,
    images,
    selling_dealership,
    lot,
    current_bid,
    bid_count
) VALUES (
    :id,
    :vin,
    :year,
    :make,
    :model,
    :trim,
    :body_style,
    :exterior_color,
    :interior_color,
    :engine,
    :transmission,
    :drivetrain,
    :odometer_km,
    :fuel_type,
    :condition_grade,
    :condition_report,
    :damage_notes,
    :title_status,
    :province,
    :city,
    :auction_start,
    :starting_bid,
    :reserve_price,
    :buy_now_price,
    :images,
    :selling_dealership,
    :lot,
    :current_bid,
    :bid_count
);
"""


def load_vehicles():
    with SOURCE_JSON_PATH.open("r", encoding="utf-8") as source_file:
        return json.load(source_file)


def serialize_vehicle(vehicle):
    record = dict(vehicle)
    record["damage_notes"] = json.dumps(vehicle["damage_notes"])
    record["images"] = json.dumps(vehicle["images"])
    return record


def main():
    vehicles = load_vehicles()

    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS vehicles;")
        cursor.execute(CREATE_TABLE_SQL)
        cursor.executemany(INSERT_SQL, (serialize_vehicle(vehicle) for vehicle in vehicles))
        connection.commit()

        vehicle_count = cursor.execute("SELECT COUNT(*) FROM vehicles;").fetchone()[0]

    print(f"Loaded {vehicle_count} vehicles into {DATABASE_PATH}")


if __name__ == "__main__":
    main()
