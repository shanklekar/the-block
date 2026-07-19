from __future__ import annotations

import asyncio
import sqlite3
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app import main
from backend.app.schemas import (
    FilterCriteria,
    FilterOperator,
    FilterRule,
    LogicOperator,
    PurchasedVehicleSearchRequest,
    SortDirection,
    SortField,
    VehicleSearchRequest,
)
from backend.tests.test_support import BackendApiTestCase, BackendDatabaseTestCase


class MainHelperTests(BackendDatabaseTestCase):
    def test_build_where_clause_supports_computed_fields_and_text_matching(self) -> None:
        clause, parameters = main.build_where_clause(
            FilterCriteria(
                match=LogicOperator.AND,
                rules=[
                    FilterRule(field="make", operator=FilterOperator.CONTAINS, value="for"),
                    FilterRule(field="current_bid", operator=FilterOperator.GTE, value=1200),
                ],
            )
        )

        self.assertIn("LOWER(vehicles.make) LIKE LOWER(?)", clause)
        self.assertIn("bid_summary.current_bid >= ?", clause)
        self.assertEqual(parameters, ["%for%", 1200])

    def test_translate_criteria_to_stored_timeline_shifts_datetime_filters_backwards(self) -> None:
        with self.connect() as connection:
            offset = main.get_auction_start_offset(connection)

        shifted = main._translate_criteria_to_stored_timeline(
            FilterCriteria(
                rules=[
                    FilterRule(
                        field="auction_start",
                        operator=FilterOperator.BETWEEN,
                        value={
                            "min": "2026-07-19T00:00:00",
                            "max": "2026-07-20T00:00:00",
                        },
                    )
                ]
            ),
            offset,
        )

        translated_value = shifted.rules[0].value
        self.assertEqual(translated_value["min"][:10], "2024-01-01")
        self.assertEqual(translated_value["max"][:10], "2024-01-02")

    def test_vehicle_bidding_connection_manager_broadcasts_user_specific_state(self) -> None:
        class FakeWebSocket:
            def __init__(self, should_fail: bool = False) -> None:
                self.accepted = False
                self.messages: list[dict[str, object]] = []
                self.should_fail = should_fail

            async def accept(self) -> None:
                self.accepted = True

            async def send_json(self, payload: dict[str, object]) -> None:
                if self.should_fail:
                    raise RuntimeError("socket closed")
                self.messages.append(payload)

        manager = main.VehicleBiddingConnectionManager()
        first = FakeWebSocket()
        second = FakeWebSocket(should_fail=True)
        manager._connections = {"veh-started": {first: 1, second: 2}}

        asyncio.run(manager.broadcast("veh-started"))

        self.assertEqual(len(first.messages), 1)
        self.assertEqual(first.messages[0]["vehicle_id"], "veh-started")
        self.assertFalse(first.messages[0]["is_high_bidder"])
        self.assertNotIn(second, manager._connections["veh-started"])


class ApiEndpointTests(BackendApiTestCase):
    def test_health_and_root_endpoints_respond(self) -> None:
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})
        self.assertEqual(
            self.client.get("/").json(),
            {"message": "The Block API is running"},
        )

    def test_list_users_and_create_user(self) -> None:
        list_response = self.client.get("/api/users")

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(
            [user["user_name"] for user in list_response.json()],
            ["Alice", "Bob", "Carla"],
        )

        create_response = self.client.post("/api/users", json={"user_name": "Dana"})
        duplicate_response = self.client.post("/api/users", json={"user_name": "  dana "})

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["user_name"], "Dana")
        self.assertEqual(duplicate_response.status_code, 409)
        self.assertEqual(duplicate_response.json()["detail"], "User name already exists")

    def test_filter_metadata_and_options_endpoints(self) -> None:
        metadata_response = self.client.get("/api/vehicles/filters/metadata")
        options_response = self.client.post(
            "/api/vehicles/filters/options",
            json={
                "field": "make",
                "query": "Fo",
                "criteria": {
                    "rules": [
                        {"field": "year", "operator": "gte", "value": 2021},
                    ]
                },
            },
        )

        self.assertEqual(metadata_response.status_code, 200)
        metadata_payload = metadata_response.json()
        self.assertEqual(metadata_payload["numeric"]["bid_count"]["max"], 1.0)
        self.assertIn("Ford", metadata_payload["categorical"]["make"])
        self.assertTrue(metadata_payload["datetime"]["auction_start"]["min"].startswith("20"))

        self.assertEqual(options_response.status_code, 200)
        self.assertEqual(options_response.json()["options"], [{"value": "Ford", "label": "Ford"}])

    def test_vehicle_search_excludes_purchased_and_sets_user_flags(self) -> None:
        response = self.client.post(
            "/api/vehicles/search",
            json={
                "user_id": 1,
                "sort_by": "current_price",
                "sort_direction": "asc",
                "criteria": {
                    "match": "or",
                    "rules": [
                        {"field": "make", "operator": "eq", "value": "Ford"},
                        {"field": "make", "operator": "eq", "value": "Toyota"},
                    ],
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 2)
        self.assertEqual([vehicle["id"] for vehicle in payload["vehicles"]], ["veh-started", "veh-no-buy"])
        self.assertTrue(payload["vehicles"][0]["is_watched"])
        self.assertFalse(payload["vehicles"][0]["is_high_bidder"])
        self.assertEqual(payload["vehicles"][0]["current_bid"], 1200.0)

    def test_watched_vehicle_search_and_filter_options_require_a_real_user(self) -> None:
        search_response = self.client.post(
            "/api/users/1/watching/vehicles/search",
            json={"user_id": 999, "sort_by": "auction_start"},
        )
        options_response = self.client.post(
            "/api/users/1/watching/vehicles/filters/options",
            json={"field": "model", "criteria": {"rules": []}},
        )
        missing_user_response = self.client.post(
            "/api/users/999/watching/vehicles/search",
            json={},
        )

        self.assertEqual(search_response.status_code, 200)
        vehicles = search_response.json()["vehicles"]
        self.assertEqual([vehicle["id"] for vehicle in vehicles], ["veh-started", "veh-future"])
        self.assertTrue(all(not vehicle["is_purchased"] for vehicle in vehicles))

        self.assertEqual(options_response.status_code, 200)
        self.assertEqual(
            [option["value"] for option in options_response.json()["options"]],
            ["Civic", "F-150"],
        )

        self.assertEqual(missing_user_response.status_code, 404)
        self.assertEqual(missing_user_response.json()["detail"], "User not found")

    def test_get_vehicle_detail_includes_purchase_and_high_bidder_flags(self) -> None:
        response = self.client.get("/api/vehicles/veh-sold", params={"user_id": 1})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["is_purchased"])
        self.assertTrue(payload["is_purchased_by_user"])
        self.assertTrue(payload["is_high_bidder"])
        self.assertEqual(payload["current_bid"], 3500.0)
        self.assertEqual(payload["bid_count"], 1)

    def test_vehicle_search_uses_joined_bid_summary_fields(self) -> None:
        response = self.client.post(
            "/api/vehicles/search",
            json={
                "user_id": 2,
                "criteria": {
                    "rules": [
                        {"field": "current_bid", "operator": "gte", "value": 1200},
                    ],
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["vehicles"][0]["id"], "veh-started")
        self.assertEqual(payload["vehicles"][0]["current_bid"], 1200.0)
        self.assertEqual(payload["vehicles"][0]["bid_count"], 1)
        self.assertTrue(payload["vehicles"][0]["is_high_bidder"])

    def test_mutate_watching_is_idempotent_for_add_and_remove(self) -> None:
        add_response = self.client.post(
            "/api/users/1/watching",
            json={"vehicle_id": "veh-no-buy", "watch": True},
        )
        repeat_add_response = self.client.post(
            "/api/users/1/watching",
            json={"vehicle_id": "veh-no-buy", "watch": True},
        )
        remove_response = self.client.post(
            "/api/users/1/watching",
            json={"vehicle_id": "veh-no-buy", "watch": False},
        )

        self.assertEqual(add_response.status_code, 200)
        self.assertTrue(add_response.json()["is_watched"])
        self.assertTrue(repeat_add_response.json()["is_watched"])
        self.assertFalse(remove_response.json()["is_watched"])

        with self.connect() as connection:
            watches = connection.execute(
                "SELECT COUNT(*) AS total FROM watching WHERE user_id = ? AND vehicle_id = ?",
                [1, "veh-no-buy"],
            ).fetchone()

        self.assertEqual(watches["total"], 0)

    def test_ensure_vehicle_is_watched_is_idempotent(self) -> None:
        with self.connect() as connection:
            main._ensure_vehicle_is_watched(
                connection,
                user_id=1,
                vehicle_id="veh-started",
            )
            main._ensure_vehicle_is_watched(
                connection,
                user_id=1,
                vehicle_id="veh-started",
            )
            connection.commit()
            watches = connection.execute(
                "SELECT COUNT(*) AS total FROM watching WHERE user_id = ? AND vehicle_id = ?",
                [1, "veh-started"],
            ).fetchone()

        self.assertEqual(watches["total"], 1)

    def test_get_bidding_state_reports_started_future_and_high_bidder_status(self) -> None:
        started_response = self.client.get(
            "/api/vehicles/veh-started/bidding-state",
            params={"user_id": 2},
        )
        future_response = self.client.get(
            "/api/vehicles/veh-future/bidding-state",
            params={"user_id": 1},
        )

        self.assertEqual(started_response.status_code, 200)
        started_payload = started_response.json()
        self.assertTrue(started_payload["auction_started"])
        self.assertTrue(started_payload["is_high_bidder"])
        self.assertEqual(started_payload["minimum_next_bid"], 1300.0)

        self.assertEqual(future_response.status_code, 200)
        future_payload = future_response.json()
        self.assertFalse(future_payload["auction_started"])
        self.assertEqual(future_payload["minimum_next_bid"], 2100.0)

    def test_place_bid_success_updates_bid_state_and_watchlist(self) -> None:
        with patch("backend.app.main._broadcast_bidding_state", new=AsyncMock()) as broadcast:
            response = self.client.post(
                "/api/users/1/vehicles/veh-started/bids",
                json={"amount": 1300},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["current_bid"], 1300.0)
        self.assertEqual(payload["bid_count"], 2)
        broadcast.assert_awaited_once_with("veh-started")

        with self.connect() as connection:
            latest_bid = connection.execute(
                """
                SELECT user_id, current_bid
                FROM bids
                WHERE vehicle_id = ?
                ORDER BY bid_placed_at DESC, rowid DESC
                LIMIT 1
                """,
                ["veh-started"],
            ).fetchone()
            watch_row = connection.execute(
                """
                SELECT 1
                FROM watching
                WHERE user_id = ? AND vehicle_id = ?
                LIMIT 1
                """,
                [1, "veh-started"],
            ).fetchone()

        self.assertEqual(latest_bid["user_id"], 1)
        self.assertEqual(latest_bid["current_bid"], 1300.0)
        self.assertIsNotNone(watch_row)

    def test_place_bid_rejects_low_amount_high_bidder_not_started_and_sold_cases(self) -> None:
        scenarios = [
            (
                "/api/users/1/vehicles/veh-started/bids",
                {"amount": 1200},
                "Bid amount must be at least the minimum next bid",
            ),
            (
                "/api/users/2/vehicles/veh-started/bids",
                {"amount": 1300},
                "You already hold the highest bid",
            ),
            (
                "/api/users/1/vehicles/veh-future/bids",
                {"amount": 2100},
                "Auction has not started",
            ),
            (
                "/api/users/2/vehicles/veh-sold/bids",
                {"amount": 3600},
                "Vehicle has already been sold",
            ),
        ]

        for path, body, expected_detail in scenarios:
            with self.subTest(path=path):
                response = self.client.post(path, json=body)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["detail"], expected_detail)

        with self.connect() as connection:
            bid_total = connection.execute(
                "SELECT COUNT(*) AS total FROM bids WHERE vehicle_id = ?",
                ["veh-started"],
            ).fetchone()

        self.assertEqual(bid_total["total"], 1)

    def test_vehicle_bidding_websocket_sends_initial_snapshot_and_rejects_unstarted_auctions(self) -> None:
        with self.client.websocket_connect("/ws/vehicles/veh-started/bidding?user_id=2") as websocket:
            payload = websocket.receive_json()

        self.assertEqual(payload["vehicle_id"], "veh-started")
        self.assertTrue(payload["auction_started"])
        self.assertTrue(payload["is_high_bidder"])

        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws/vehicles/veh-future/bidding?user_id=1") as websocket:
                websocket.receive_json()

    def test_mutate_purchased_creates_purchase_marks_watch_and_broadcasts(self) -> None:
        with patch("backend.app.main._broadcast_bidding_state", new=AsyncMock()) as broadcast:
            response = self.client.post(
                "/api/users/2/purchased",
                json={"vehicle_id": "veh-started", "buy_now_price": 5000},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["is_purchased"])
        self.assertEqual(payload["purchase_amount"], 5000.0)
        broadcast.assert_awaited_once_with("veh-started")

        with self.connect() as connection:
            purchase = connection.execute(
                """
                SELECT user_id, purchase_amount
                FROM purchased
                WHERE vehicle_id = ?
                """,
                ["veh-started"],
            ).fetchone()
            watch = connection.execute(
                """
                SELECT 1
                FROM watching
                WHERE user_id = ? AND vehicle_id = ?
                """,
                [2, "veh-started"],
            ).fetchone()

        self.assertEqual(purchase["user_id"], 2)
        self.assertEqual(purchase["purchase_amount"], 5000.0)
        self.assertIsNotNone(watch)

    def test_mutate_purchased_is_idempotent_for_same_user(self) -> None:
        first = self.client.post(
            "/api/users/2/purchased",
            json={"vehicle_id": "veh-future", "buy_now_price": 6000},
        )

        with patch("backend.app.main._broadcast_bidding_state", new=AsyncMock()) as broadcast:
            second = self.client.post(
                "/api/users/2/purchased",
                json={"vehicle_id": "veh-future", "buy_now_price": 6000},
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["purchase_date"], second.json()["purchase_date"])
        self.assertEqual(first.json()["purchase_amount"], second.json()["purchase_amount"])
        broadcast.assert_awaited_once_with("veh-future")

    def test_mutate_purchased_rejects_mismatched_missing_and_taken_buy_now_prices(self) -> None:
        mismatch = self.client.post(
            "/api/users/1/purchased",
            json={"vehicle_id": "veh-started", "buy_now_price": 4999},
        )
        no_buy_now = self.client.post(
            "/api/users/1/purchased",
            json={"vehicle_id": "veh-no-buy", "buy_now_price": 0},
        )
        already_taken = self.client.post(
            "/api/users/2/purchased",
            json={"vehicle_id": "veh-sold", "buy_now_price": 7000},
        )

        self.assertEqual(mismatch.status_code, 409)
        self.assertEqual(mismatch.json()["detail"], "Buy now price does not match")
        self.assertEqual(no_buy_now.status_code, 409)
        self.assertEqual(no_buy_now.json()["detail"], "Buy now price does not match")
        self.assertEqual(already_taken.status_code, 409)
        self.assertEqual(
            already_taken.json()["detail"],
            "Vehicle has already been purchased by another user",
        )

    def test_search_purchased_vehicles_returns_only_user_purchases_and_matches_detail_search(self) -> None:
        self.client.post(
            "/api/users/2/purchased",
            json={"vehicle_id": "veh-future", "buy_now_price": 6000},
        )

        response = self.client.post(
            "/api/users/1/purchased/vehicles/search",
            json={"search": "Tesla", "sort_by": "purchase_amount", "sort_direction": "desc"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["vehicles"][0]["id"], "veh-sold")
        self.assertEqual(payload["vehicles"][0]["purchase_amount"], 7000.0)

    def test_validation_and_sqlite_exception_handlers_return_expected_payloads(self) -> None:
        validation_response = self.client.post(
            "/api/vehicles/search",
            json={"limit": 0},
        )

        self.assertEqual(validation_response.status_code, 422)
        self.assertEqual(validation_response.json()["detail"][0]["type"], "greater_than_equal")

        @contextmanager
        def broken_connection() -> None:
            raise sqlite3.OperationalError("boom")
            yield

        client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(client.close)

        with patch("backend.app.main.get_connection", broken_connection):
            error_response = client.get("/api/users")

        self.assertEqual(error_response.status_code, 500)
        self.assertEqual(error_response.json(), {"detail": "Internal server error"})
