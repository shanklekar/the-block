from __future__ import annotations

from pydantic import ValidationError

from backend.app.schemas import (
    FilterOperator,
    FilterRule,
    UserCreateRequest,
    VehicleFilterOptionsRequest,
)
from backend.tests.test_support import BackendDatabaseTestCase


class SchemaValidationTests(BackendDatabaseTestCase):
    def test_text_filter_rule_requires_supported_field_and_non_empty_value(self) -> None:
        with self.assertRaises(ValidationError):
            FilterRule(field="unknown", operator=FilterOperator.EQ, value="Ford")

        with self.assertRaises(ValidationError):
            FilterRule(field="make", operator=FilterOperator.EQ, value=" ")

        rule = FilterRule(field="make", operator=FilterOperator.CONTAINS, value="Ford")
        self.assertEqual(rule.value, "Ford")

    def test_numeric_filter_rule_rejects_boolean_and_requires_between_bounds(self) -> None:
        with self.assertRaises(ValidationError):
            FilterRule(field="year", operator=FilterOperator.GTE, value=True)

        with self.assertRaises(ValidationError):
            FilterRule(field="current_bid", operator=FilterOperator.BETWEEN, value={"min": 1000})

        rule = FilterRule(
            field="current_bid",
            operator=FilterOperator.BETWEEN,
            value={"min": 1000, "max": 1500},
        )
        self.assertEqual(rule.value["max"], 1500)

    def test_datetime_filter_rule_validates_iso_strings_and_null_operators(self) -> None:
        with self.assertRaises(ValidationError):
            FilterRule(field="auction_start", operator=FilterOperator.LT, value="tomorrow")

        with self.assertRaises(ValidationError):
            FilterRule(field="auction_start", operator=FilterOperator.IS_NULL, value="2026-07-19")

        rule = FilterRule(
            field="auction_start",
            operator=FilterOperator.IN,
            value=["2026-07-19T00:00:00", "2026-07-20T00:00:00"],
        )
        self.assertEqual(len(rule.value), 2)

    def test_vehicle_filter_options_request_rejects_unsupported_option_field(self) -> None:
        with self.assertRaises(ValidationError):
            VehicleFilterOptionsRequest(field="current_bid")

        request = VehicleFilterOptionsRequest(field="make", query="Fo")
        self.assertEqual(request.field, "make")

    def test_user_create_request_trims_and_rejects_blank_names(self) -> None:
        request = UserCreateRequest(user_name="  Dana  ")
        self.assertEqual(request.user_name, "Dana")

        with self.assertRaises(ValidationError):
            UserCreateRequest(user_name="   ")
