import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_BID_INCREMENT = 100;

function parseAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function hasAuctionStarted(auctionStart) {
  if (!auctionStart) {
    return false;
  }

  const timestamp = Date.parse(auctionStart);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function buildMinimumNextBid(currentBid, startingBid) {
  const bidBase = currentBid ?? startingBid ?? 0;
  return bidBase + DEFAULT_BID_INCREMENT;
}

function toWebSocketUrl(apiBaseUrl) {
  if (apiBaseUrl.startsWith("https://")) {
    return `wss://${apiBaseUrl.slice("https://".length)}`;
  }

  if (apiBaseUrl.startsWith("http://")) {
    return `ws://${apiBaseUrl.slice("http://".length)}`;
  }

  return apiBaseUrl;
}

export function buildInitialBiddingState(vehicle) {
  const currentBid = parseAmount(vehicle?.current_bid);
  const startingBid = parseAmount(vehicle?.starting_bid);

  return {
    vehicle_id: vehicle?.id ?? "",
    auction_started: hasAuctionStarted(vehicle?.auction_start),
    is_sold: Boolean(vehicle?.is_purchased),
    current_bid: currentBid,
    starting_bid: startingBid,
    bid_count: Number.isFinite(vehicle?.bid_count) ? vehicle.bid_count : 0,
    minimum_next_bid: buildMinimumNextBid(currentBid, startingBid),
  };
}

export function mergeVehicleWithBiddingState(vehicle, biddingState) {
  if (!vehicle) {
    return null;
  }

  if (!biddingState) {
    return vehicle;
  }

  return {
    ...vehicle,
    current_bid: biddingState.current_bid,
    starting_bid: biddingState.starting_bid ?? vehicle.starting_bid,
    bid_count: biddingState.bid_count,
    is_purchased: Boolean(vehicle.is_purchased || biddingState.is_sold),
  };
}

export function getLiveDisplayBid(vehicle, biddingState) {
  const liveVehicle = mergeVehicleWithBiddingState(vehicle, biddingState);
  return liveVehicle?.current_bid ?? liveVehicle?.starting_bid ?? null;
}

export function useVehicleLiveBidding({
  apiBaseUrl,
  enabled = true,
  fetchInitialState = false,
  userId,
  vehicle,
}) {
  const [biddingState, setBiddingState] = useState(() => buildInitialBiddingState(vehicle));
  const [stateErrorMessage, setStateErrorMessage] = useState("");
  const websocketRef = useRef(null);

  useEffect(() => {
    setBiddingState(buildInitialBiddingState(vehicle));
    setStateErrorMessage("");
  }, [
    vehicle?.auction_start,
    vehicle?.bid_count,
    vehicle?.current_bid,
    vehicle?.id,
    vehicle?.is_purchased,
    vehicle?.starting_bid,
  ]);

  useEffect(() => {
    if (!enabled || !fetchInitialState || !vehicle?.id || userId === null || userId === undefined) {
      return undefined;
    }

    const controller = new AbortController();

    async function hydrateBiddingState() {
      try {
        setStateErrorMessage("");
        const response = await fetch(
          `${apiBaseUrl}/api/vehicles/${vehicle.id}/bidding-state?user_id=${userId}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Unable to load bidding state.");
        }

        const payload = await response.json();
        setBiddingState(payload);
      } catch (error) {
        if (error.name !== "AbortError") {
          setStateErrorMessage("We couldn't load the latest bidding state.");
        }
      }
    }

    hydrateBiddingState();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, enabled, fetchInitialState, userId, vehicle?.id]);

  useEffect(() => {
    if (!enabled || !vehicle?.id || userId === null || userId === undefined) {
      websocketRef.current?.close();
      websocketRef.current = null;
      return undefined;
    }

    if (!biddingState?.auction_started || biddingState?.is_sold) {
      websocketRef.current?.close();
      websocketRef.current = null;
      return undefined;
    }

    const websocket = new WebSocket(
      `${toWebSocketUrl(apiBaseUrl)}/ws/vehicles/${vehicle.id}/bidding?user_id=${userId}`,
    );
    websocketRef.current = websocket;

    websocket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setBiddingState(payload);
      } catch {
        // Ignore malformed socket payloads in the demo.
      }
    });

    websocket.addEventListener("error", () => {
      setStateErrorMessage("We couldn't keep the live bid feed connected.");
    });

    websocket.addEventListener("close", () => {
      if (websocketRef.current === websocket) {
        websocketRef.current = null;
      }
    });

    return () => {
      websocket.close();
      if (websocketRef.current === websocket) {
        websocketRef.current = null;
      }
    };
  }, [
    apiBaseUrl,
    biddingState?.auction_started,
    biddingState?.is_sold,
    enabled,
    userId,
    vehicle?.id,
  ]);

  const liveVehicle = useMemo(
    () => mergeVehicleWithBiddingState(vehicle, biddingState),
    [biddingState, vehicle],
  );

  return {
    biddingState,
    canBid: Boolean(enabled && biddingState?.auction_started && !biddingState?.is_sold),
    liveVehicle,
    stateErrorMessage,
  };
}
