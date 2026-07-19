from __future__ import annotations

import json
import os
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from itertools import count
from typing import Any


RUN_LIVE_SMOKE = os.getenv("BLOCK_LIVE_API_SMOKE") == "1"
DEFAULT_BASE_URL = os.getenv("BLOCK_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("BLOCK_API_TIMEOUT_SECONDS", "10"))
FORCED_BIDDING_VEHICLE_ID = os.getenv("BLOCK_SMOKE_BIDDING_VEHICLE_ID")


class LiveApiClient:
    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        expected_statuses: set[int] | None = None,
    ) -> tuple[int, Any]:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query, doseq=True)}"

        payload_bytes: bytes | None = None
        headers: dict[str, str] = {}
        if json_body is not None:
            payload_bytes = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            url,
            data=payload_bytes,
            headers=headers,
            method=method.upper(),
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                status_code = response.status
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            status_code = error.code
            body = error.read().decode("utf-8")

        parsed_body: Any
        try:
            parsed_body = json.loads(body) if body else None
        except json.JSONDecodeError:
            parsed_body = body

        if expected_statuses is not None and status_code not in expected_statuses:
            raise AssertionError(
                f"{method.upper()} {url} returned {status_code}, expected one of "
                f"{sorted(expected_statuses)}. Body: {parsed_body!r}"
            )

        return status_code, parsed_body


@unittest.skipUnless(
    RUN_LIVE_SMOKE,
    "Set BLOCK_LIVE_API_SMOKE=1 to run live API smoke tests against a running backend.",
)
class LiveApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.client = LiveApiClient(DEFAULT_BASE_URL, REQUEST_TIMEOUT_SECONDS)
        cls._name_counter = count()

    def test_live_health_and_search_endpoints_respond(self) -> None:
        health_status, health_payload = self.client.request(
            "GET",
            "/health",
            expected_statuses={200},
        )
        root_status, root_payload = self.client.request(
            "GET",
            "/",
            expected_statuses={200},
        )
        search_status, search_payload = self.client.request(
            "POST",
            "/api/vehicles/search",
            json_body={"limit": 5, "offset": 0},
            expected_statuses={200},
        )

        self.assertEqual(health_status, 200)
        self.assertEqual(health_payload, {"status": "ok"})
        self.assertEqual(root_status, 200)
        self.assertEqual(root_payload, {"message": "The Block API is running"})
        self.assertEqual(search_status, 200)
        self.assertIn("vehicles", search_payload)
        self.assertLessEqual(search_payload["count"], 5)
        self.assertGreaterEqual(search_payload["total"], search_payload["count"])

    def test_three_users_can_bid_in_rapid_succession_without_self_bidding_or_short_increments(self) -> None:
        users = [self._create_user("smoke-bidder") for _ in range(3)]
        user_ids = [user["user_id"] for user in users]
        vehicle_id = self._find_bid_eligible_vehicle_id(user_ids[0])

        initial_state = self._get_bidding_state(vehicle_id, user_ids[0])
        self.assertTrue(
            initial_state["auction_started"],
            f"Vehicle {vehicle_id} must already be live for the smoke test.",
        )
        self.assertFalse(
            initial_state["is_sold"],
            f"Vehicle {vehicle_id} must not already be sold for the smoke test.",
        )

        current_bid = (
            float(initial_state["current_bid"])
            if initial_state["current_bid"] is not None
            else float(initial_state["starting_bid"] or 0.0)
        )
        current_high_bidder_id = self._find_current_high_bidder_id(vehicle_id, user_ids)

        bootstrap_bidder_id = next(
            user_id for user_id in user_ids if user_id != current_high_bidder_id
        )
        bootstrap_amount = current_bid + 100.0
        bootstrap_status, bootstrap_payload = self.client.request(
            "POST",
            f"/api/users/{bootstrap_bidder_id}/vehicles/{vehicle_id}/bids",
            json_body={"amount": bootstrap_amount},
            expected_statuses={200},
        )
        self.assertEqual(bootstrap_status, 200)
        self.assertEqual(bootstrap_payload["user_id"], bootstrap_bidder_id)

        current_bid = bootstrap_amount
        current_high_bidder_id = bootstrap_bidder_id

        successful_smoke_bids = 1

        for round_number in range(3):
            challenger_ids = [user_id for user_id in user_ids if user_id != current_high_bidder_id]
            low_bidder_id = challenger_ids[0]
            valid_bidder_id = challenger_ids[1]
            valid_amount = current_bid + 100.0
            low_amount = current_bid + 99.0

            def submit_bid(user_id: int, amount: float) -> tuple[int, Any]:
                return self.client.request(
                    "POST",
                    f"/api/users/{user_id}/vehicles/{vehicle_id}/bids",
                    json_body={"amount": amount},
                    expected_statuses={200, 409},
                )

            with ThreadPoolExecutor(max_workers=3) as executor:
                self_bid_future = executor.submit(
                    submit_bid,
                    current_high_bidder_id,
                    valid_amount,
                )
                low_bid_future = executor.submit(
                    submit_bid,
                    low_bidder_id,
                    low_amount,
                )
                valid_bid_future = executor.submit(
                    submit_bid,
                    valid_bidder_id,
                    valid_amount,
                )

            self_bid_status, self_bid_payload = self_bid_future.result()
            low_bid_status, low_bid_payload = low_bid_future.result()
            valid_bid_status, valid_bid_payload = valid_bid_future.result()

            self.assertEqual(
                self_bid_status,
                409,
                f"Round {round_number + 1}: the current leader should never be able to bid against themselves.",
            )
            self.assertEqual(self_bid_payload["detail"], "You already hold the highest bid")

            self.assertEqual(
                low_bid_status,
                409,
                f"Round {round_number + 1}: bids less than $100 above the current bid must be rejected.",
            )
            self.assertEqual(
                low_bid_payload["detail"],
                "Bid amount must be at least the minimum next bid",
            )

            self.assertEqual(
                valid_bid_status,
                200,
                f"Round {round_number + 1}: one challenger should win the exact minimum valid bid during the rapid burst.",
            )
            self.assertEqual(valid_bid_payload["user_id"], valid_bidder_id)
            self.assertEqual(valid_bid_payload["vehicle_id"], vehicle_id)
            self.assertEqual(float(valid_bid_payload["amount"]), valid_amount)
            self.assertEqual(float(valid_bid_payload["current_bid"]), valid_amount)

            state_after_bid = self._get_bidding_state(vehicle_id, valid_bidder_id)
            self.assertTrue(state_after_bid["is_high_bidder"])
            self.assertEqual(float(state_after_bid["current_bid"]), valid_amount)
            self.assertEqual(float(state_after_bid["minimum_next_bid"]), valid_amount + 100.0)

            current_bid = valid_amount
            current_high_bidder_id = valid_bidder_id
            successful_smoke_bids += 1

        final_state = self._get_bidding_state(vehicle_id, current_high_bidder_id)
        self.assertTrue(final_state["is_high_bidder"])
        self.assertEqual(float(final_state["current_bid"]), current_bid)
        self.assertEqual(float(final_state["minimum_next_bid"]), current_bid + 100.0)
        self.assertGreaterEqual(
            final_state["bid_count"],
            initial_state["bid_count"] + successful_smoke_bids,
        )

    def _create_user(self, prefix: str) -> dict[str, Any]:
        unique_suffix = f"{int(time.time() * 1000)}-{next(self._name_counter)}"
        user_name = f"{prefix}-{unique_suffix}"
        status_code, payload = self.client.request(
            "POST",
            "/api/users",
            json_body={"user_name": user_name},
            expected_statuses={201},
        )
        self.assertEqual(status_code, 201)
        self.assertEqual(payload["user_name"], user_name)
        return payload

    def _find_bid_eligible_vehicle_id(self, user_id: int) -> str:
        candidate_ids: list[str] = []

        if FORCED_BIDDING_VEHICLE_ID:
            candidate_ids.append(FORCED_BIDDING_VEHICLE_ID)

        _, search_payload = self.client.request(
            "POST",
            "/api/vehicles/search",
            json_body={
                "limit": 100,
                "offset": 0,
                "sort_by": "auction_start",
                "sort_direction": "asc",
                "user_id": user_id,
            },
            expected_statuses={200},
        )
        candidate_ids.extend(vehicle["id"] for vehicle in search_payload["vehicles"])

        seen_vehicle_ids: set[str] = set()
        for vehicle_id in candidate_ids:
            if vehicle_id in seen_vehicle_ids:
                continue
            seen_vehicle_ids.add(vehicle_id)

            _, state_payload = self.client.request(
                "GET",
                f"/api/vehicles/{vehicle_id}/bidding-state",
                query={"user_id": user_id},
                expected_statuses={200, 404, 409},
            )
            if not isinstance(state_payload, dict):
                continue
            if state_payload.get("auction_started") and not state_payload.get("is_sold"):
                return vehicle_id

        raise AssertionError(
            "Could not find a live, unsold vehicle for smoke bidding. "
            "Set BLOCK_SMOKE_BIDDING_VEHICLE_ID to a known eligible vehicle if needed."
        )

    def _get_bidding_state(self, vehicle_id: str, user_id: int) -> dict[str, Any]:
        status_code, payload = self.client.request(
            "GET",
            f"/api/vehicles/{vehicle_id}/bidding-state",
            query={"user_id": user_id},
            expected_statuses={200},
        )
        self.assertEqual(status_code, 200)
        return payload

    def _find_current_high_bidder_id(self, vehicle_id: str, user_ids: list[int]) -> int | None:
        for user_id in user_ids:
            state = self._get_bidding_state(vehicle_id, user_id)
            if state["is_high_bidder"]:
                return user_id
        return None
