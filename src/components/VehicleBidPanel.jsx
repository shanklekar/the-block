import { useEffect, useState } from "react";
import { formatAuctionDate, formatCurrency } from "../inventoryConfig";

const QUICK_BID_INCREMENTS = [100, 250, 500];
const DEFAULT_BID_INCREMENT = 100;

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
  const [bidAmount, setBidAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
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
  const canSubmit = auctionStarted && !isSold && !isPurchasedByUser && !isHighBidder;
  const parsedBidAmount = parseBidAmount(bidAmount);
  const isBidTooLow = parsedBidAmount !== null && parsedBidAmount < minimumNextBid;
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
    isHighBidder ? "is-high-bidder" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setBidAmount("");
    setErrorMessage("");
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
    if (!minimumNextBid) {
      return;
    }

    const nextBidAmount = parseBidAmount(bidAmount);
    if (nextBidAmount === null || nextBidAmount < minimumNextBid) {
      setBidAmount(String(Math.round(minimumNextBid)));
    }
  }, [bidAmount, minimumNextBid]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      !displayVehicle?.id ||
      !canSubmit ||
      parsedBidAmount === null ||
      parsedBidAmount < minimumNextBid
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
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
      setErrorMessage(error.message || "We couldn't place that bid right now.");
    } finally {
      setIsSubmitting(false);
    }
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
  } else if (isHighBidder) {
    submitButtonLabel = "You are the highest bidder";
  }

  return (
    <section className={panelClassName}>
      <div className="vehicle-bid-panel-header">
        <p className="inventory-panel-label">Live bidding</p>
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

      <form className="vehicle-bid-panel-form" onSubmit={handleSubmit}>
        <div className="vehicle-bid-panel-shortcuts">
          {QUICK_BID_INCREMENTS.map((increment) => (
            <button
              className="bid-shortcut-button"
              key={increment}
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={() => {
                setBidAmount(String((displayBid ?? 0) + increment));
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
            className="vehicle-bid-panel-input"
            inputMode="numeric"
            min={minimumNextBid}
            step="100"
            type="number"
            value={bidAmount}
            disabled={!canSubmit || isSubmitting}
            onChange={(event) => {
              setBidAmount(event.target.value);
              setErrorMessage("");
              setSuccessMessage("");
            }}
          />
        </label>

        {isBidTooLow ? (
          <p className="vehicle-bid-panel-hint">
            Enter at least {formatCurrency(minimumNextBid)}.
          </p>
        ) : (
          <p className="vehicle-bid-panel-hint">
            Bid in $100+ steps over the current high bid to stay in the running.
          </p>
        )}

        <button
          className={submitButtonClassName}
          disabled={!canSubmit || isSubmitting || parsedBidAmount === null || isBidTooLow}
          type="submit"
        >
          {submitButtonLabel}
        </button>
      </form>
    </section>
  );
}
