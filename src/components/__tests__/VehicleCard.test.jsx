import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VehicleCard from "../VehicleCard";

vi.mock("../../useVehicleLiveBidding", () => ({
  useVehicleLiveBidding: () => ({
    biddingState: null,
    liveVehicle: null,
    stateErrorMessage: "",
  }),
}));

describe("VehicleCard", () => {
  const vehicle = {
    auction_start: "2026-07-20T15:00:00Z",
    bid_count: 0,
    buy_now_price: 12000,
    city: "Indianapolis",
    condition_grade: 4.2,
    current_bid: 10000,
    id: 42,
    images: ["https://example.com/car.jpg"],
    is_high_bidder: false,
    is_purchased: false,
    is_purchased_by_user: false,
    is_watched: false,
    make: "Honda",
    model: "Civic",
    odometer_km: 100000,
    province: "IN",
    starting_bid: 9500,
    title_status: "Clean",
    trim: "EX",
    vin: "1HGCM82633A004352",
    year: 2021,
  };

  it("copies the VIN without opening the vehicle", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<VehicleCard onSelect={onSelect} vehicle={vehicle} />);

    await user.click(
      screen.getByRole("button", {
        name: "Copy VIN 1HGCM82633A004352 to clipboard",
      }),
    );

    expect(writeText).toHaveBeenCalledWith("1HGCM82633A004352");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Copied VIN 1HGCM82633A004352" }),
      ).toBeInTheDocument();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("toggles watch state without bubbling the click to the card", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggleWatch = vi.fn();

    render(
      <VehicleCard
        onSelect={onSelect}
        onToggleWatch={onToggleWatch}
        showWatchToggle
        vehicle={vehicle}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add 2021 Honda Civic EX to watchlist",
      }),
    );

    expect(onToggleWatch).toHaveBeenCalledWith(42, true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
