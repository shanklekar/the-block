from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LogicOperator(str, Enum):
    AND = "and"
    OR = "or"


class FilterOperator(str, Enum):
    EQ = "eq"
    NEQ = "neq"
    LT = "lt"
    LTE = "lte"
    GT = "gt"
    GTE = "gte"
    BETWEEN = "between"
    IN = "in"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    IS_NULL = "is_null"
    NOT_NULL = "not_null"


class SortField(str, Enum):
    AUCTION_START = "auction_start"
    ODOMETER_KM = "odometer_km"
    BUY_NOW_PRICE = "buy_now_price"
    CONDITION_GRADE = "condition_grade"
    CURRENT_PRICE = "current_price"


class SortDirection(str, Enum):
    ASC = "asc"
    DESC = "desc"


TEXT_FIELDS = {
    "id",
    "vin",
    "make",
    "model",
    "trim",
    "body_style",
    "exterior_color",
    "interior_color",
    "engine",
    "transmission",
    "drivetrain",
    "fuel_type",
    "condition_report",
    "title_status",
    "province",
    "city",
    "selling_dealership",
    "lot",
}

NUMERIC_FIELDS = {
    "year",
    "odometer_km",
    "condition_grade",
    "starting_bid",
    "reserve_price",
    "buy_now_price",
    "current_bid",
    "bid_count",
}

DATETIME_FIELDS = {"auction_start"}

ALLOWED_FIELDS = TEXT_FIELDS | NUMERIC_FIELDS | DATETIME_FIELDS

TEXT_OPERATORS = {
    FilterOperator.EQ,
    FilterOperator.NEQ,
    FilterOperator.IN,
    FilterOperator.CONTAINS,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    FilterOperator.IS_NULL,
    FilterOperator.NOT_NULL,
}

NUMERIC_OPERATORS = {
    FilterOperator.EQ,
    FilterOperator.NEQ,
    FilterOperator.LT,
    FilterOperator.LTE,
    FilterOperator.GT,
    FilterOperator.GTE,
    FilterOperator.BETWEEN,
    FilterOperator.IN,
    FilterOperator.IS_NULL,
    FilterOperator.NOT_NULL,
}

DATETIME_OPERATORS = {
    FilterOperator.EQ,
    FilterOperator.NEQ,
    FilterOperator.LT,
    FilterOperator.LTE,
    FilterOperator.GT,
    FilterOperator.GTE,
    FilterOperator.BETWEEN,
    FilterOperator.IN,
    FilterOperator.IS_NULL,
    FilterOperator.NOT_NULL,
}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_datetime_string(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    try:
        datetime.fromisoformat(value)
    except ValueError:
        return False

    return True


class FilterRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str
    operator: FilterOperator
    value: Any | None = None

    @model_validator(mode="after")
    def validate_rule(self) -> "FilterRule":
        if self.field not in ALLOWED_FIELDS:
            raise ValueError(f"Unsupported field: {self.field}")

        operators = TEXT_OPERATORS
        validator = self._validate_text_value

        if self.field in NUMERIC_FIELDS:
            operators = NUMERIC_OPERATORS
            validator = self._validate_numeric_value
        elif self.field in DATETIME_FIELDS:
            operators = DATETIME_OPERATORS
            validator = self._validate_datetime_value

        if self.operator not in operators:
            raise ValueError(
                f"Operator '{self.operator.value}' is not allowed for field '{self.field}'"
            )

        validator()
        return self

    def _validate_text_value(self) -> None:
        if self.operator in {FilterOperator.IS_NULL, FilterOperator.NOT_NULL}:
            if self.value is not None:
                raise ValueError("Null-check operators cannot include a value")
            return

        if self.operator == FilterOperator.IN:
            if (
                not isinstance(self.value, list)
                or not self.value
                or any(not isinstance(item, str) for item in self.value)
            ):
                raise ValueError("Text 'in' filters require a non-empty list of strings")
            return

        if not isinstance(self.value, str) or not self.value.strip():
            raise ValueError("Text filters require a non-empty string value")

    def _validate_numeric_value(self) -> None:
        if self.operator in {FilterOperator.IS_NULL, FilterOperator.NOT_NULL}:
            if self.value is not None:
                raise ValueError("Null-check operators cannot include a value")
            return

        if self.operator == FilterOperator.BETWEEN:
            if not isinstance(self.value, dict):
                raise ValueError("Numeric 'between' filters require an object value")

            minimum = self.value.get("min")
            maximum = self.value.get("max")
            if minimum is None or maximum is None:
                raise ValueError("Numeric 'between' filters require both min and max")
            if not _is_number(minimum) or not _is_number(maximum):
                raise ValueError("Numeric 'between' bounds must be numbers")
            return

        if self.operator == FilterOperator.IN:
            if (
                not isinstance(self.value, list)
                or not self.value
                or any(not _is_number(item) for item in self.value)
            ):
                raise ValueError("Numeric 'in' filters require a non-empty list of numbers")
            return

        if not _is_number(self.value):
            raise ValueError("Numeric filters require a number value")

    def _validate_datetime_value(self) -> None:
        if self.operator in {FilterOperator.IS_NULL, FilterOperator.NOT_NULL}:
            if self.value is not None:
                raise ValueError("Null-check operators cannot include a value")
            return

        if self.operator == FilterOperator.BETWEEN:
            if not isinstance(self.value, dict):
                raise ValueError("Datetime 'between' filters require an object value")

            minimum = self.value.get("min")
            maximum = self.value.get("max")
            if not _is_datetime_string(minimum) or not _is_datetime_string(maximum):
                raise ValueError(
                    "Datetime 'between' filters require ISO-8601 min and max strings"
                )
            return

        if self.operator == FilterOperator.IN:
            if (
                not isinstance(self.value, list)
                or not self.value
                or any(not _is_datetime_string(item) for item in self.value)
            ):
                raise ValueError(
                    "Datetime 'in' filters require a non-empty list of ISO-8601 strings"
                )
            return

        if not _is_datetime_string(self.value):
            raise ValueError("Datetime filters require an ISO-8601 string value")


class FilterCriteria(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match: LogicOperator = LogicOperator.AND
    rules: list[FilterRule] = Field(default_factory=list, max_length=25)


class VehicleSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    criteria: FilterCriteria = Field(default_factory=FilterCriteria)
    sort_by: SortField = SortField.AUCTION_START
    sort_direction: SortDirection = SortDirection.ASC
    user_id: int | None = Field(default=None, ge=0)


class VehicleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    vin: str
    year: int
    make: str
    model: str
    trim: str | None = None
    body_style: str | None = None
    exterior_color: str | None = None
    interior_color: str | None = None
    engine: str | None = None
    transmission: str | None = None
    drivetrain: str | None = None
    odometer_km: int | None = None
    fuel_type: str | None = None
    condition_grade: float | None = None
    condition_report: str | None = None
    damage_notes: list[str]
    title_status: str | None = None
    province: str | None = None
    city: str | None = None
    auction_start: str | None = None
    starting_bid: float | None = None
    reserve_price: float | None = None
    buy_now_price: float | None = None
    images: list[str]
    selling_dealership: str | None = None
    lot: str | None = None
    current_bid: float | None = None
    bid_count: int


class VehicleSearchResult(VehicleResponse):
    is_watched: bool = False
    is_purchased: bool = False
    is_purchased_by_user: bool = False


class VehicleDetailResponse(VehicleResponse):
    is_watched: bool = False
    is_purchased: bool = False
    is_purchased_by_user: bool = False


class VehicleSearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    count: int
    limit: int
    offset: int
    total: int
    vehicles: list[VehicleSearchResult]


class WatchingMutationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_id: str = Field(min_length=1)
    watch: bool


class WatchingMutationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int
    vehicle_id: str
    is_watched: bool


class PurchaseMutationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_id: str = Field(min_length=1)
    buy_now_price: float


class PurchaseMutationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int
    vehicle_id: str
    purchase_amount: float
    purchase_date: str
    is_purchased: bool


class BidPlacementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: float = Field(gt=0)


class BidPlacementResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int
    vehicle_id: str
    amount: float
    current_bid: float
    bid_count: int
    bid_placed_at: str


class BiddingStateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_id: str
    auction_started: bool
    is_sold: bool
    current_bid: float | None = None
    starting_bid: float | None = None
    bid_count: int
    minimum_next_bid: float


class NumericMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: float | None = None
    max: float | None = None


class DatetimeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: str | None = None
    max: str | None = None


class VehicleFilterMetadataResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    categorical: dict[str, list[str]]
    numeric: dict[str, NumericMetadata]
    datetime: dict[str, DatetimeMetadata]
