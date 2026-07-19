import { act, renderHook, waitFor } from "@testing-library/react";
import {
  buildInitialBiddingState,
  getLiveDisplayBid,
  mergeVehicleWithBiddingState,
  useVehicleLiveBidding,
} from "../useVehicleLiveBidding";

class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.close = vi.fn(() => {
      this.readyState = 3;
    });
    MockWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
  }
}

describe("useVehicleLiveBidding helpers", () => {
  it("builds initial bidding state from the vehicle snapshot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"));

    expect(
      buildInitialBiddingState({
        auction_start: "2026-07-19T11:00:00Z",
        bid_count: 3,
        current_bid: "12500",
        id: 17,
        is_high_bidder: true,
        is_purchased: false,
        starting_bid: "12000",
      }),
    ).toEqual({
      auction_started: true,
      bid_count: 3,
      current_bid: 12500,
      is_high_bidder: true,
      is_sold: false,
      minimum_next_bid: 12600,
      starting_bid: 12000,
      vehicle_id: 17,
    });

    vi.useRealTimers();
  });

  it("merges live bidding state over the base vehicle and derives the display bid", () => {
    const vehicle = {
      current_bid: 12000,
      id: 7,
      is_high_bidder: false,
      is_purchased: false,
      is_purchased_by_user: true,
      starting_bid: 11000,
    };
    const biddingState = {
      bid_count: 5,
      current_bid: 13100,
      is_high_bidder: true,
      is_sold: true,
      starting_bid: 11500,
    };

    expect(mergeVehicleWithBiddingState(vehicle, biddingState)).toEqual({
      bid_count: 5,
      current_bid: 13100,
      id: 7,
      is_high_bidder: true,
      is_purchased: true,
      is_purchased_by_user: true,
      starting_bid: 11500,
    });
    expect(getLiveDisplayBid(vehicle, biddingState)).toBe(13100);
  });
});

describe("useVehicleLiveBidding", () => {
  const baseVehicle = {
    auction_start: "2020-07-19T11:00:00Z",
    bid_count: 1,
    current_bid: 10000,
    id: 42,
    is_high_bidder: false,
    is_purchased: false,
    starting_bid: 9500,
  };

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates bidding state from the API when the auction is already live", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        auction_started: true,
        bid_count: 4,
        current_bid: 11100,
        is_high_bidder: false,
        is_sold: false,
        minimum_next_bid: 11200,
        starting_bid: 9500,
        vehicle_id: 42,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useVehicleLiveBidding({
        apiBaseUrl: "http://127.0.0.1:8000",
        fetchInitialState: true,
        userId: 9,
        vehicle: baseVehicle,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/vehicles/42/bidding-state?user_id=9",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.biddingState.current_bid).toBe(11100);
    });
    expect(result.current.liveVehicle.current_bid).toBe(11100);
    expect(result.current.canBid).toBe(true);
  });

  it("skips the initial fetch before the auction starts unless the vehicle is sold", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useVehicleLiveBidding({
        apiBaseUrl: "http://127.0.0.1:8000",
        fetchInitialState: true,
        userId: 9,
        vehicle: {
          ...baseVehicle,
          auction_start: "2099-07-20T11:00:00Z",
        },
      }),
    );

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens a websocket for an active auction and applies incoming live updates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        auction_started: true,
        bid_count: 1,
        current_bid: 10000,
        is_high_bidder: false,
        is_sold: false,
        minimum_next_bid: 10100,
        starting_bid: 9500,
        vehicle_id: 42,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useVehicleLiveBidding({
        apiBaseUrl: "http://127.0.0.1:8000",
        fetchInitialState: true,
        userId: 9,
        vehicle: baseVehicle,
      }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.url).toBe("ws://127.0.0.1:8000/ws/vehicles/42/bidding?user_id=9");

    act(() => {
      socket.emit("open");
      socket.emit("message", {
        data: JSON.stringify({
          auction_started: true,
          bid_count: 2,
          current_bid: 10800,
          is_high_bidder: true,
          is_sold: false,
          minimum_next_bid: 10900,
          starting_bid: 9500,
          vehicle_id: 42,
        }),
      });
    });
    await waitFor(() => {
      expect(result.current.biddingState.current_bid).toBe(10800);
    });
    expect(result.current.liveVehicle.bid_count).toBe(2);
    expect(result.current.canBid).toBe(false);
  });

  it("surfaces a live feed error when the websocket closes unexpectedly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        auction_started: true,
        bid_count: 1,
        current_bid: 10000,
        is_high_bidder: false,
        is_sold: false,
        minimum_next_bid: 10100,
        starting_bid: 9500,
        vehicle_id: 42,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useVehicleLiveBidding({
        apiBaseUrl: "http://127.0.0.1:8000",
        fetchInitialState: true,
        userId: 9,
        vehicle: baseVehicle,
      }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0].emit("close");
    });

    await waitFor(() => {
      expect(result.current.stateErrorMessage).toBe(
        "We couldn't keep the live bid feed connected.",
      );
    });
  });

  it("closes the websocket intentionally when live bidding is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        auction_started: true,
        bid_count: 1,
        current_bid: 10000,
        is_high_bidder: false,
        is_sold: false,
        minimum_next_bid: 10100,
        starting_bid: 9500,
        vehicle_id: 42,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderHook(
      (props) => useVehicleLiveBidding(props),
      {
        initialProps: {
          apiBaseUrl: "http://127.0.0.1:8000",
          fetchInitialState: true,
          userId: 9,
          vehicle: baseVehicle,
        },
      },
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];

    rerender({
      apiBaseUrl: "http://127.0.0.1:8000",
      enabled: false,
      fetchInitialState: true,
      userId: 9,
      vehicle: baseVehicle,
    });

    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
