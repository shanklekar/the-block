import { useEffect, useRef, useState } from "react";
import { formatAuctionDate, formatCurrency } from "../inventoryConfig";

const QUICK_BID_INCREMENTS = [100, 250, 500];
const DEFAULT_BID_INCREMENT = 100;
const LOW_BID_ERROR_MESSAGE = "Bid is too low";
const LOW_BID_ERROR_TIMEOUT_MS = 2400;

function parseBidAmount(value) {
  if (value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export default function VehicleBidPanel({
  apiBaseUrl = "",
  biddingState,
  displayVehicle,
  isPurchased = false,
  onBidPlaced,
  stateErrorMessage = "",
  userId,
  variant = "card",
}) {
  const lowBidErrorTimeoutRef = useRef(null);
  const [bidAmount, setBidAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [hasBidInputError, setHasBidInputError] = useState(false);
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOptimisticallyHighBidder, setIsOptimisticallyHighBidder] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const minimumNextBid = biddingState?.minimum_next_bid ?? 0;
  const auctionStarted = Boolean(biddingState?.auction_started);
  const isSold = Boolean(biddingState?.is_sold || displayVehicle?.is_purchased);
  const isPurchasedByUser = Boolean(isPurchased || displayVehicle?.is_purchased_by_user);
  const isHighBidder = Boolean(
    isOptimisticallyHighBidder ||
      biddingState?.is_high_bidder ||
      displayVehicle?.is_high_bidder,
  );
  const canToggleBidding = auctionStarted && !isSold && !isPurchasedByUser;
  const canSubmit = auctionStarted && !isSold && !isPurchasedByUser && !isHighBidder;
  const isGuardedSubmitState = canSubmit && !isSubmitting && !isBiddingEnabled;
  const parsedBidAmount = parseBidAmount(bidAmount);
  const bidButtonAmount = parsedBidAmount ?? minimumNextBid;
  const displayBid = displayVehicle?.current_bid ?? displayVehicle?.starting_bid ?? null;
  const bidCount = Number.isFinite(displayVehicle?.bid_count) ? displayVehicle.bid_count : 0;
  const summaryBidLabel = bidCount === 0 ? "Start Bid" : "Current high bid";
  const auctionStartTime = displayVehicle?.auction_start
    ? formatAuctionDate(displayVehicle.auction_start)
    : "Auction in progress";
  const panelClassName = [
    "vehicle-bid-panel",
    variant === "detail" ? "vehicle-bid-panel-detail" : "vehicle-bid-panel-card",
  ]
    .filter(Boolean)
    .join(" ");
  const submitButtonClassName = [
    "bid-submit-button",
    isGuardedSubmitState ? "is-guarded" : "",
    isHighBidder ? "is-high-bidder" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const biddingToggleClassName = [
    "vehicle-bid-toggle",
    isBiddingEnabled ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const bidInputClassName = [
    "vehicle-bid-panel-input",
    hasBidInputError ? "has-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function clearLowBidErrorTimeout() {
    if (lowBidErrorTimeoutRef.current) {
      window.clearTimeout(lowBidErrorTimeoutRef.current);
      lowBidErrorTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    clearLowBidErrorTimeout();
    setBidAmount(minimumNextBid ? String(Math.round(minimumNextBid)) : "");
    setErrorMessage("");
    setHasBidInputError(false);
    setIsBiddingEnabled(false);
    setIsSubmitting(false);
    setIsOptimisticallyHighBidder(false);
    setSuccessMessage("");
  }, [displayVehicle?.id]);

  useEffect(() => {
    if (!biddingState?.is_high_bidder && !displayVehicle?.is_high_bidder) {
      setIsOptimisticallyHighBidder(false);
    }
  }, [biddingState?.is_high_bidder, displayVehicle?.is_high_bidder]);

  useEffect(() => {
    if (stateErrorMessage) {
      console.error("[VehicleBidPanel] Live bidding state error:", stateErrorMessage);
    }
  }, [stateErrorMessage]);

  useEffect(() => {
    if (errorMessage) {
      console.error("[VehicleBidPanel] Live bidding submit error:", errorMessage);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (errorMessage !== LOW_BID_ERROR_MESSAGE) {
      return undefined;
    }

    clearLowBidErrorTimeout();
    lowBidErrorTimeoutRef.current = window.setTimeout(() => {
      setErrorMessage("");
      setHasBidInputError(false);
      lowBidErrorTimeoutRef.current = null;
    }, LOW_BID_ERROR_TIMEOUT_MS);

    return () => {
      clearLowBidErrorTimeout();
    };
  }, [errorMessage]);

  useEffect(() => {
    return () => {
      clearLowBidErrorTimeout();
    };
  }, []);

  async function submitBid() {
    if (!displayVehicle?.id || !canSubmit || parsedBidAmount === null) {
      return;
    }

    if (parsedBidAmount < minimumNextBid) {
      setErrorMessage(LOW_BID_ERROR_MESSAGE);
      setHasBidInputError(true);
      return;
    }

    try {
      setIsSubmitting(true);
      setHasBidInputError(false);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        `${apiBaseUrl}/api/users/${userId}/vehicles/${displayVehicle.id}/bids`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: parsedBidAmount,
          }),
        },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.detail ?? "We couldn't place that bid right now.");
      }

      setSuccessMessage(`Bid placed at ${formatCurrency(payload.current_bid)}.`);
      setIsOptimisticallyHighBidder(true);
      setBidAmount(String(Math.round(payload.current_bid + DEFAULT_BID_INCREMENT)));
      onBidPlaced?.(payload);
    } catch (error) {
      setHasBidInputError(false);
      setErrorMessage(error.message || "We couldn't place that bid right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isGuardedSubmitState) {
      setIsBiddingEnabled(true);
      setSuccessMessage("");
      return;
    }

    await submitBid();
  }

  if (!auctionStarted) {
    return null;
  }

  let feedbackMessage = "";
  let feedbackMessageClassName = "";

  if (successMessage && variant !== "detail") {
    feedbackMessage = successMessage;
    feedbackMessageClassName = "inventory-inline-message";
  }

  let submitButtonLabel = `Bid now ${formatCurrency(bidButtonAmount)}`;
  if (isSubmitting) {
    submitButtonLabel = "Submitting bid...";
  } else if (isGuardedSubmitState) {
    submitButtonLabel = "Toggle bidding";
  } else if (isHighBidder) {
    submitButtonLabel = "You are the highest bidder";
  }

  return (
    <section className={panelClassName}>
      <div className="vehicle-bid-panel-header">
        <div className="vehicle-bid-panel-header-row">
          <p className="inventory-panel-label">Live bidding</p>
          <button
            aria-label={isBiddingEnabled ? "Disable bidding" : "Enable bidding"}
            aria-pressed={isBiddingEnabled}
            className={biddingToggleClassName}
            disabled={!canToggleBidding || isSubmitting}
            type="button"
            onClick={() => {
              setIsBiddingEnabled((currentValue) => !currentValue);
              setSuccessMessage("");
            }}
          >
            <span className="vehicle-bid-toggle-track" aria-hidden="true">
              <span className="vehicle-bid-toggle-thumb" />
            </span>
            <span className="vehicle-bid-toggle-label">
              {isBiddingEnabled ? "Bidding on" : "Bidding off"}
            </span>
          </button>
        </div>
        <div className="vehicle-bid-panel-auction-block">
          <span className="vehicle-bid-panel-auction-label">Auction Start Time:</span>
          <span className="vehicle-bid-panel-auction">{auctionStartTime}</span>
        </div>
      </div>

      <div className="vehicle-bid-panel-summary">
        <div className="vehicle-bid-panel-summary-card vehicle-bid-panel-summary-card-primary">
          <span>{summaryBidLabel}</span>
          <strong>
            {formatCurrency(displayBid)}{" "}
            <span className="vehicle-bid-panel-bid-count">
              ({bidCount.toLocaleString()} bids)
            </span>
          </strong>
        </div>
      </div>

      {feedbackMessage ? (
        <div
          aria-live="polite"
          className={feedbackMessageClassName}
          role={feedbackMessageClassName === "inventory-inline-message" ? "status" : undefined}
        >
          {feedbackMessage}
        </div>
      ) : null}

      <form className="vehicle-bid-panel-form" noValidate onSubmit={handleSubmit}>
        <div className="vehicle-bid-panel-shortcuts">
          {QUICK_BID_INCREMENTS.map((increment) => (
            <button
              className="bid-shortcut-button"
              key={increment}
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={() => {
                setBidAmount(String((displayBid ?? 0) + increment));
                setHasBidInputError(false);
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              {`+${formatCurrency(increment)}`}
            </button>
          ))}
        </div>

        <label className="vehicle-bid-panel-input-group">
          <span>Your bid</span>
          <input
            aria-invalid={hasBidInputError}
            className={bidInputClassName}
            inputMode="numeric"
            type="number"
            value={bidAmount}
            disabled={!canSubmit || isSubmitting}
            onChange={(event) => {
              setBidAmount(event.target.value);
              setHasBidInputError(false);
              setErrorMessage("");
              setSuccessMessage("");
            }}
          />
        </label>

        <p className="vehicle-bid-panel-hint">
          Bid in $100+ steps over the current high bid to stay in the running.
        </p>

        {errorMessage ? (
          <div className="vehicle-bid-panel-inline-message error" role="status">
            {errorMessage}
          </div>
        ) : null}

        <button
          className={submitButtonClassName}
          disabled={
            !isGuardedSubmitState &&
            (!canSubmit || isSubmitting || parsedBidAmount === null)
          }
          type="button"
          onClick={handleSubmit}
        >
          {submitButtonLabel}
        </button>
      </form>
    </section>
  );
}
