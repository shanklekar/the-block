import { useEffect, useMemo, useState } from "react";
import { formatAuctionDate, formatCurrency } from "../inventoryConfig";
import {
  getLiveDisplayBid,
  useVehicleLiveBidding,
} from "../useVehicleLiveBidding";

const QUICK_BID_INCREMENTS = [100, 250, 500];

function parseBidAmount(value) {
  if (value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export default function BidNowModal({
  apiBaseUrl,
  onBidPlaced,
  onClose,
  userId,
  vehicle,
}) {
  const [bidAmount, setBidAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { biddingState, liveVehicle, stateErrorMessage } = useVehicleLiveBidding({
    apiBaseUrl,
    fetchInitialState: true,
    userId,
    vehicle,
  });

  const displayBid = useMemo(
    () => getLiveDisplayBid(vehicle, biddingState),
    [biddingState, vehicle],
  );
  const minimumNextBid = biddingState?.minimum_next_bid ?? 0;
  const auctionStarted = Boolean(biddingState?.auction_started);
  const isSold = Boolean(biddingState?.is_sold || liveVehicle?.is_purchased);
  const canSubmit = auctionStarted && !isSold;
  const parsedBidAmount = parseBidAmount(bidAmount);
  const isBidTooLow = parsedBidAmount !== null && parsedBidAmount < minimumNextBid;
  const vehicleTitle = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim]
    .filter(Boolean)
    .join(" ");
  const auctionStartMessage = auctionStarted
    ? ""
    : vehicle?.auction_start
      ? `Auction starts ${formatAuctionDate(vehicle.auction_start)}.`
      : "This auction has not started yet.";

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

    if (!vehicle?.id || !canSubmit || parsedBidAmount === null || parsedBidAmount < minimumNextBid) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await fetch(
        `${apiBaseUrl}/api/users/${userId}/vehicles/${vehicle.id}/bids`,
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

      onBidPlaced?.(payload);
      onClose();
    } catch (error) {
      setErrorMessage(error.message || "We couldn't place that bid right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-shell bid-now-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop modal-backdrop-strong" onClick={onClose} />
      <section className="bid-now-modal">
        <header className="bid-now-header">
          <div>
            <p className="inventory-panel-label">Live bidding</p>
            <h2>{vehicleTitle || "Place your bid"}</h2>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="bid-now-summary">
          <div className="bid-now-summary-card">
            <span>Current high bid</span>
            <strong>{formatCurrency(displayBid)}</strong>
          </div>
          <div className="bid-now-summary-card">
            <span>Minimum next bid</span>
            <strong>{formatCurrency(minimumNextBid)}</strong>
          </div>
          <div className="bid-now-summary-card">
            <span>Bid count</span>
            <strong>{liveVehicle?.bid_count?.toLocaleString?.() ?? "0"}</strong>
          </div>
        </div>

        {!auctionStarted ? <div className="inventory-feedback">{auctionStartMessage}</div> : null}
        {isSold ? (
          <div className="inventory-feedback error">This vehicle has already been sold.</div>
        ) : null}
        {stateErrorMessage ? (
          <div className="inventory-feedback error">{stateErrorMessage}</div>
        ) : null}
        {errorMessage ? <div className="inventory-feedback error">{errorMessage}</div> : null}

        <form className="bid-now-form" onSubmit={handleSubmit}>
          <label className="bid-now-input-group">
            <span>Your bid</span>
            <input
              className="bid-now-input"
              inputMode="numeric"
              min={minimumNextBid}
              step="50"
              type="number"
              value={bidAmount}
              onChange={(event) => setBidAmount(event.target.value)}
            />
          </label>

          <div className="bid-now-shortcuts">
            {QUICK_BID_INCREMENTS.map((increment) => (
              <button
                className="bid-shortcut-button"
                key={increment}
                type="button"
                onClick={() => setBidAmount(String((displayBid ?? 0) + increment))}
              >
                {`+${formatCurrency(increment)}`}
              </button>
            ))}
          </div>

          {isBidTooLow ? (
            <p className="bid-now-hint">Enter at least {formatCurrency(minimumNextBid)}.</p>
          ) : (
            <p className="bid-now-hint">
              Bid in $100+ steps over the current high bid to stay in the running.
            </p>
          )}

          <button
            className="bid-submit-button"
            disabled={!canSubmit || isSubmitting || parsedBidAmount === null || isBidTooLow}
            type="submit"
          >
            {isSubmitting ? "Submitting bid..." : `Bid now ${formatCurrency(parsedBidAmount)}`}
          </button>
        </form>
      </section>
    </div>
  );
}
