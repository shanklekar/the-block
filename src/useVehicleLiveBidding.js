import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_BID_INCREMENT = 100;
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_MESSAGE = "ping";

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
    is_high_bidder: Boolean(vehicle?.is_high_bidder),
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
    is_purchased_by_user: Boolean(vehicle.is_purchased_by_user),
    is_high_bidder: Boolean(
      biddingState.is_high_bidder ?? vehicle.is_high_bidder,
    ),
  };
}

export function getLiveDisplayBid(vehicle, biddingState) {
  const liveVehicle = mergeVehicleWithBiddingState(vehicle, biddingState);
  return liveVehicle?.current_bid ?? liveVehicle?.starting_bid ?? null;
}

export function useVehicleLiveBidding({
  apiBaseUrl,
  enabled = true,
  enableWebSocket = enabled,
  fetchInitialState = false,
  userId,
  vehicle,
}) {
  const [biddingState, setBiddingState] = useState(() => buildInitialBiddingState(vehicle));
  const [stateErrorMessage, setStateErrorMessage] = useState("");
  const websocketRef = useRef(null);
  const websocketLifecycleRef = useRef(null);

  function clearHeartbeatInterval(lifecycleState) {
    if (lifecycleState?.heartbeatIntervalId) {
      window.clearInterval(lifecycleState.heartbeatIntervalId);
      lifecycleState.heartbeatIntervalId = null;
    }
  }

  function closeCurrentWebSocket() {
    const currentWebsocket = websocketRef.current;
    const lifecycleState = websocketLifecycleRef.current;

    if (!currentWebsocket || !lifecycleState) {
      websocketRef.current = null;
      websocketLifecycleRef.current = null;
      return;
    }

    lifecycleState.intentionalClose = true;
    clearHeartbeatInterval(lifecycleState);
    websocketRef.current = null;
    websocketLifecycleRef.current = null;
    currentWebsocket.close();
  }

  useEffect(() => {
    setBiddingState(buildInitialBiddingState(vehicle));
    setStateErrorMessage("");
  }, [vehicle?.id]);

  useEffect(() => {
    if (!enabled || !fetchInitialState || !vehicle?.id || userId === null || userId === undefined) {
      return undefined;
    }

    if (!hasAuctionStarted(vehicle?.auction_start) && !vehicle?.is_purchased) {
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
    if (!enabled || !enableWebSocket || !vehicle?.id || userId === null || userId === undefined) {
      closeCurrentWebSocket();
      setStateErrorMessage("");
      return undefined;
    }

    if (!biddingState?.auction_started || biddingState?.is_sold) {
      closeCurrentWebSocket();
      setStateErrorMessage("");
      return undefined;
    }

    let websocket = null;
    let lifecycleState = null;
    let cancelled = false;
    const connectTimeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      websocket = new WebSocket(
        `${toWebSocketUrl(apiBaseUrl)}/ws/vehicles/${vehicle.id}/bidding?user_id=${userId}`,
      );
      lifecycleState = {
        heartbeatIntervalId: null,
        hadError: false,
        intentionalClose: false,
        opened: false,
      };
      websocketRef.current = websocket;
      websocketLifecycleRef.current = lifecycleState;

      function isCurrentConnection() {
        return (
          websocketRef.current === websocket &&
          websocketLifecycleRef.current === lifecycleState
        );
      }

      websocket.addEventListener("open", () => {
        if (!isCurrentConnection()) {
          return;
        }

        lifecycleState.opened = true;
        lifecycleState.hadError = false;
        clearHeartbeatInterval(lifecycleState);
        lifecycleState.heartbeatIntervalId = window.setInterval(() => {
          if (!isCurrentConnection() || lifecycleState.intentionalClose) {
            return;
          }

          try {
            websocket.send(HEARTBEAT_MESSAGE);
          } catch {
            // Let the close/error handlers surface connection problems.
          }
        }, HEARTBEAT_INTERVAL_MS);
        setStateErrorMessage("");
      });

      websocket.addEventListener("message", (event) => {
        if (!isCurrentConnection()) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          setBiddingState(payload);
        } catch {
          // Ignore malformed socket payloads in the demo.
        }
      });

      websocket.addEventListener("error", () => {
        if (!isCurrentConnection() || lifecycleState.intentionalClose) {
          return;
        }

        lifecycleState.hadError = true;
      });

      websocket.addEventListener("close", () => {
        if (!isCurrentConnection()) {
          return;
        }

        clearHeartbeatInterval(lifecycleState);
        websocketRef.current = null;
        websocketLifecycleRef.current = null;

        if (lifecycleState.intentionalClose) {
          return;
        }

        if (enabled && biddingState?.auction_started && !biddingState?.is_sold) {
          setStateErrorMessage("We couldn't keep the live bid feed connected.");
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimeoutId);

      if (!websocket || !lifecycleState) {
        return;
      }

      lifecycleState.intentionalClose = true;
      clearHeartbeatInterval(lifecycleState);

      if (
        websocketRef.current === websocket &&
        websocketLifecycleRef.current === lifecycleState
      ) {
        websocketRef.current = null;
        websocketLifecycleRef.current = null;
      }

      websocket.close();
    };
  }, [
    apiBaseUrl,
    biddingState?.auction_started,
    biddingState?.is_sold,
    enabled,
    enableWebSocket,
    userId,
    vehicle?.id,
  ]);

  const liveVehicle = useMemo(
    () => mergeVehicleWithBiddingState(vehicle, biddingState),
    [biddingState, vehicle],
  );

  return {
    biddingState,
    canBid: Boolean(
      enabled &&
        biddingState?.auction_started &&
        !biddingState?.is_sold &&
        !biddingState?.is_high_bidder,
    ),
    liveVehicle,
    stateErrorMessage,
  };
}
