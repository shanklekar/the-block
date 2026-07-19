import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VehicleBidPanel from "../VehicleBidPanel";

describe("VehicleBidPanel", () => {
  const displayVehicle = {
    auction_start: "2026-07-19T12:00:00Z",
    bid_count: 2,
    current_bid: 10000,
    id: 42,
    is_high_bidder: false,
    is_purchased: false,
    is_purchased_by_user: false,
    starting_bid: 9500,
  };

  const biddingState = {
    auction_started: true,
    bid_count: 2,
    current_bid: 10000,
    is_high_bidder: false,
    is_sold: false,
    minimum_next_bid: 10100,
    starting_bid: 9500,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not render before the auction starts", () => {
    const { container } = render(
      <VehicleBidPanel
        biddingState={{ ...biddingState, auction_started: false }}
        displayVehicle={displayVehicle}
        userId={7}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("uses the guarded submit state to turn bidding on before placing bids", async () => {
    const user = userEvent.setup();
    const onBiddingToggleChange = vi.fn();
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehicleBidPanel
        apiBaseUrl="http://127.0.0.1:8000"
        biddingState={biddingState}
        displayVehicle={displayVehicle}
        isBiddingEnabled={false}
        onBiddingToggleChange={onBiddingToggleChange}
        userId={7}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Toggle bidding" });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(onBiddingToggleChange).toHaveBeenCalledWith(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the quick bid buttons prefill higher amounts from the current bid", async () => {
    const user = userEvent.setup();

    render(
      <VehicleBidPanel
        biddingState={biddingState}
        displayVehicle={displayVehicle}
        isBiddingEnabled
        userId={7}
      />,
    );

    const bidInput = screen.getByRole("spinbutton");
    expect(bidInput).toHaveValue(10100);

    await user.click(screen.getByRole("button", { name: "+$250" }));

    expect(bidInput).toHaveValue(10250);
    expect(screen.getByRole("button", { name: "Bid now $10,250" })).toBeEnabled();
  });

  it("shows and then clears the low bid error without making a request", async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehicleBidPanel
        apiBaseUrl="http://127.0.0.1:8000"
        biddingState={biddingState}
        displayVehicle={displayVehicle}
        isBiddingEnabled
        userId={7}
      />,
    );

    const bidInput = screen.getByRole("spinbutton");
    fireEvent.change(bidInput, { target: { value: "10050" } });
    fireEvent.click(screen.getByRole("button", { name: "Bid now $10,050" }));

    expect(screen.getByRole("status")).toHaveTextContent("Bid is too low");
    expect(bidInput).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2400);
    });

    expect(screen.queryByText("Bid is too low")).not.toBeInTheDocument();
    expect(bidInput).toHaveAttribute("aria-invalid", "false");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[VehicleBidPanel] Live bidding submit error:",
      "Bid is too low",
    );
  });

  it("submits a bid, shows optimistic success feedback, and notifies the parent", async () => {
    const user = userEvent.setup();
    const onBidPlaced = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current_bid: 10400,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehicleBidPanel
        apiBaseUrl="http://127.0.0.1:8000"
        biddingState={biddingState}
        displayVehicle={displayVehicle}
        isBiddingEnabled
        onBidPlaced={onBidPlaced}
        userId={7}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bid now $10,100" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/users/7/vehicles/42/bids",
        {
          body: JSON.stringify({ amount: 10100 }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Bid placed at $10,400.");
    expect(onBidPlaced).toHaveBeenCalledWith({ current_bid: 10400 });
    expect(screen.getByRole("spinbutton")).toHaveValue(10500);
    expect(screen.getByRole("button", { name: "Bid now $10,500" })).toBeEnabled();
  });

  it("shows the highest-bidder state when the bidding state is authoritative", () => {
    render(
      <VehicleBidPanel
        biddingState={{ ...biddingState, is_high_bidder: true }}
        displayVehicle={{ ...displayVehicle, is_high_bidder: false }}
        isBiddingEnabled
        userId={7}
      />,
    );

    expect(
      screen.getByRole("button", { name: "You are the highest bidder" }),
    ).toBeDisabled();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });

  it("surfaces server-side bid failures without hiding the panel", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        detail: "Bid window closed",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehicleBidPanel
        apiBaseUrl="http://127.0.0.1:8000"
        biddingState={biddingState}
        displayVehicle={displayVehicle}
        isBiddingEnabled
        userId={7}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bid now $10,100" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bid window closed");
    expect(screen.getByText("Live bidding")).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[VehicleBidPanel] Live bidding submit error:",
      "Bid window closed",
    );
  });
});
