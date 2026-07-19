from __future__ import annotations

from datetime import timedelta

from backend.app import database
from backend.tests.test_support import BackendDatabaseTestCase


class DatabaseUtilitiesTests(BackendDatabaseTestCase):
    def test_parse_json_column_returns_only_lists(self) -> None:
        self.assertEqual(database._parse_json_column(None), [])
        self.assertEqual(database._parse_json_column(""), [])
        self.assertEqual(database._parse_json_column('{"not": "a list"}'), [])
        self.assertEqual(database._parse_json_column("not-json"), [])
        self.assertEqual(database._parse_json_column('["one", "two"]'), ["one", "two"])

    def test_parse_datetime_column_handles_invalid_values(self) -> None:
        parsed = database._parse_datetime_column("2026-07-19T08:15:30")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-07-19T08:15:30")
        self.assertIsNone(database._parse_datetime_column(None))
        self.assertIsNone(database._parse_datetime_column("not-a-timestamp"))

    def test_shift_auction_start_applies_offset_and_preserves_invalid_values(self) -> None:
        shifted = database.shift_auction_start(
            "2024-01-01T00:00:00",
            timedelta(days=2, hours=3),
        )

        self.assertEqual(shifted, "2024-01-03T03:00:00")
        self.assertEqual(database.shift_auction_start("bad-value", timedelta(days=1)), "bad-value")

    def test_get_auction_start_offset_aligns_oldest_vehicle_to_today(self) -> None:
        with self.connect() as connection:
            offset = database.get_auction_start_offset(connection)
            shifted = database.shift_auction_start("2024-01-01T00:00:00", offset)

        self.assertIsNotNone(shifted)
        self.assertEqual(shifted[:10], database.date.today().isoformat())

    def test_serialize_vehicle_normalizes_live_fields_and_json_columns(self) -> None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                    vehicles.*,
                    1350.0 AS live_current_bid,
                    3 AS live_bid_count
                FROM vehicles
                WHERE id = ?
                """,
                ["veh-started"],
            ).fetchone()

        serialized = database.serialize_vehicle(
            row,
            auction_start_offset=timedelta(days=1),
        )

        self.assertEqual(serialized["current_bid"], 1350.0)
        self.assertEqual(serialized["bid_count"], 3)
        self.assertNotIn("live_current_bid", serialized)
        self.assertNotIn("live_bid_count", serialized)
        self.assertNotIn("reserve_price", serialized)
        self.assertEqual(serialized["damage_notes"], ["Scratch on tailgate"])
        self.assertEqual(serialized["images"], ["https://example.com/started-1.jpg"])
        self.assertEqual(serialized["auction_start"], "2024-01-02T00:00:00")
