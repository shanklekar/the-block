import {
  buildSearchCriteria,
  createDefaultFilters,
  formatAuctionCountdown,
} from "../inventoryConfig";

describe("inventoryConfig", () => {
  it("builds search criteria from active filters and normalizes miles inputs", () => {
    const filters = createDefaultFilters();

    filters.text.vin = "  1HG  ";
    filters.categorical.make = ["Honda"];
    filters.range.odometer_km = { min: "62", max: "124" };
    filters.range.buy_now_price = { min: "5000", max: "" };
    filters.datetime.auction_start = {
      min: "2026-07-19T09:30",
      max: "2026-07-20T10:45:30",
    };
    filters.flags.buy_now_available = true;

    expect(buildSearchCriteria(filters)).toEqual({
      match: "and",
      rules: [
        {
          field: "vin",
          operator: "contains",
          value: "1HG",
        },
        {
          field: "make",
          operator: "in",
          value: ["Honda"],
        },
        {
          field: "odometer_km",
          operator: "between",
          value: {
            min: 100,
            max: 200,
          },
        },
        {
          field: "buy_now_price",
          operator: "gte",
          value: 5000,
        },
        {
          field: "auction_start",
          operator: "between",
          value: {
            min: "2026-07-19T09:30:00",
            max: "2026-07-20T10:45:30",
          },
        },
        {
          field: "buy_now_price",
          operator: "gt",
          value: 0,
        },
      ],
    });
  });

  it("formats auction countdown across day, hour, and minute windows", () => {
    const now = new Date("2026-07-19T12:00:00Z").getTime();

    expect(formatAuctionCountdown("2026-07-22T12:00:00Z", now)).toBe("3 days");
    expect(formatAuctionCountdown("2026-07-20T03:00:00Z", now)).toBe("15 hours");
    expect(formatAuctionCountdown("2026-07-19T15:45:00Z", now)).toBe("3h 45m");
    expect(formatAuctionCountdown("2026-07-19T11:00:00Z", now)).toBe("");
  });
});
