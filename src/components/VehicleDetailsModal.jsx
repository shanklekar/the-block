import {
  formatAuctionDate,
  formatConditionGrade,
  formatCurrency,
  formatMilesFromKm,
} from "../inventoryConfig";
import { useVehicleLiveBidding } from "../useVehicleLiveBidding";
import BuyNowButton from "./BuyNowButton";
import VehicleBidPanel from "./VehicleBidPanel";
import WatchToggleButton from "./WatchToggleButton";

function getTitleStatusBadgeClassName(titleStatus) {
  const normalizedTitleStatus = titleStatus?.trim().toLowerCase();

  if (normalizedTitleStatus === "salvage") {
    return " vehicle-detail-hero-badge-danger";
  }

  if (normalizedTitleStatus === "clean") {
    return "";
  }

  return " vehicle-detail-hero-badge-warning";
}

function DetailItem({ label, value }) {
  return (
    <div className="vehicle-detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="vehicle-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function VehicleDetailsModal({
  apiBaseUrl = "",
  currentUserId = null,
  errorMessage,
  isPurchased = false,
  isLoading,
  onBidPlaced,
  purchaseMessage = "",
  isWatchPending = false,
  onBuyNow,
  onClose,
  onOpenImage,
  onToggleWatch,
  vehicle,
  watchErrorMessage = "",
}) {
  const { biddingState, liveVehicle, stateErrorMessage } = useVehicleLiveBidding({
    apiBaseUrl,
    enabled: Boolean(vehicle),
    fetchInitialState: true,
    userId: currentUserId,
    vehicle,
  });
  const displayVehicle = liveVehicle ?? vehicle;
  const vehicleTitle = displayVehicle
    ? [displayVehicle.year, displayVehicle.make, displayVehicle.model, displayVehicle.trim]
        .filter(Boolean)
        .join(" ")
    : "Vehicle details";
  const summaryPrice = displayVehicle?.current_bid ?? displayVehicle?.starting_bid;
  const leadImageUrl = displayVehicle?.images[0] ?? "";
  const isWatched = Boolean(displayVehicle?.is_watched);
  const watchToggleLabel = isWatched
    ? `Remove ${vehicleTitle} from watchlist`
    : `Add ${vehicleTitle} to watchlist`;
  const vehicleIsPurchased = Boolean(isPurchased);
  const vehicleIsSold = Boolean(displayVehicle?.is_purchased || biddingState?.is_sold);
  const showBuyNowButton =
    Number(displayVehicle?.buy_now_price) > 0 && (vehicleIsPurchased || !vehicleIsSold);
  const showBidPanel = Boolean(
    biddingState?.auction_started && !vehicleIsSold && !vehicleIsPurchased,
  );
  const titleStatusBadgeClassName = getTitleStatusBadgeClassName(
    displayVehicle?.title_status,
  );

  return (
    <div className="modal-shell vehicle-detail-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <section className="vehicle-detail-modal">
        <header className="vehicle-detail-header">
          <div>
            <p className="inventory-panel-label">Vehicle details</p>
            <h2>{vehicleTitle}</h2>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {isLoading ? (
          <div className="vehicle-detail-feedback">Loading vehicle details...</div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="vehicle-detail-feedback error">{errorMessage}</div>
        ) : null}

        {!isLoading && !errorMessage && displayVehicle ? (
          <div className="vehicle-detail-content">
            <section className="vehicle-detail-top">
              {leadImageUrl ? (
                <button
                  className="vehicle-detail-hero-image-button"
                  type="button"
                  onClick={() => onOpenImage(leadImageUrl)}
                >
                  <div className="vehicle-detail-hero-badges">
                    <span
                      className={`vehicle-detail-hero-badge${titleStatusBadgeClassName}`}
                    >
                      {displayVehicle.title_status ?? "N/A"}
                    </span>
                    <span className="vehicle-detail-hero-badge">
                      Grade {formatConditionGrade(displayVehicle.condition_grade)}
                    </span>
                  </div>
                  <img
                    alt={vehicleTitle}
                    className="vehicle-detail-hero-image"
                    src={leadImageUrl}
                  />
                </button>
              ) : null}

              <div className="vehicle-detail-summary-stack">
                <div className="vehicle-detail-action-stack">
                  {showBuyNowButton ? (
                    <BuyNowButton
                      className="vehicle-buy-now-detail"
                      isPurchased={vehicleIsPurchased}
                      price={displayVehicle.buy_now_price}
                      onClick={() => onBuyNow?.(displayVehicle)}
                    />
                  ) : null}
                </div>

                <div className="vehicle-detail-summary">
                  <div className="vehicle-detail-summary-primary">
                    <div className="vehicle-detail-summary-pills">
                      <span>{formatMilesFromKm(displayVehicle.odometer_km)}</span>
                    </div>
                    <div className="vehicle-detail-summary-actions">
                      <WatchToggleButton
                        className="vehicle-watch-toggle-detail"
                        disabled={isWatchPending}
                        isWatched={isWatched}
                        label={watchToggleLabel}
                        onToggle={onToggleWatch}
                      />
                    </div>
                  </div>
                  <dl className="vehicle-detail-summary-stats">
                    <div>
                      <dt>Current bid</dt>
                      <dd>{formatCurrency(summaryPrice)}</dd>
                    </div>
                    <div>
                      <dt>Auction</dt>
                      <dd>{formatAuctionDate(displayVehicle.auction_start)}</dd>
                    </div>
                    <div>
                      <dt>Starting bid</dt>
                      <dd>{formatCurrency(displayVehicle.starting_bid)}</dd>
                    </div>
                    <div>
                      <dt>Bid count</dt>
                      <dd>{displayVehicle.bid_count.toLocaleString()}</dd>
                    </div>
                  </dl>
                  {watchErrorMessage ? (
                    <div className="vehicle-detail-inline-message" role="status">
                      {watchErrorMessage}
                    </div>
                  ) : null}
                  {!showBidPanel && stateErrorMessage ? (
                    <div className="vehicle-detail-inline-message" role="status">
                      {stateErrorMessage}
                    </div>
                  ) : null}
                  {purchaseMessage ? (
                    <div className="vehicle-detail-inline-message" role="status">
                      {purchaseMessage}
                    </div>
                  ) : null}
                </div>

                {showBidPanel ? (
                  <VehicleBidPanel
                    apiBaseUrl={apiBaseUrl}
                    biddingState={biddingState}
                    displayVehicle={displayVehicle}
                    isPurchased={vehicleIsPurchased}
                    onBidPlaced={onBidPlaced}
                    stateErrorMessage={stateErrorMessage}
                    userId={currentUserId}
                    variant="detail"
                  />
                ) : null}
              </div>
            </section>

            <div className="vehicle-detail-sections">
              <DetailSection title="Vehicle specs">
                <dl className="vehicle-detail-grid">
                  <DetailItem label="Body style" value={displayVehicle.body_style ?? "N/A"} />
                  <DetailItem
                    label="Exterior color"
                    value={displayVehicle.exterior_color ?? "N/A"}
                  />
                  <DetailItem
                    label="Interior color"
                    value={displayVehicle.interior_color ?? "N/A"}
                  />
                  <DetailItem label="Engine" value={displayVehicle.engine ?? "N/A"} />
                  <DetailItem
                    label="Transmission"
                    value={displayVehicle.transmission ?? "N/A"}
                  />
                  <DetailItem label="Drivetrain" value={displayVehicle.drivetrain ?? "N/A"} />
                  <DetailItem label="Fuel type" value={displayVehicle.fuel_type ?? "N/A"} />
                  <DetailItem
                    label="Odometer"
                    value={formatMilesFromKm(displayVehicle.odometer_km)}
                  />
                </dl>
              </DetailSection>

              <DetailSection title="Auction and pricing">
                <dl className="vehicle-detail-grid">
                  <DetailItem
                    label="Starting bid"
                    value={formatCurrency(displayVehicle.starting_bid)}
                  />
                  <DetailItem label="Current bid" value={formatCurrency(summaryPrice)} />
                  <DetailItem
                    label="Reserve price"
                    value={formatCurrency(displayVehicle.reserve_price)}
                  />
                  <DetailItem
                    label="Buy now price"
                    value={formatCurrency(displayVehicle.buy_now_price)}
                  />
                  <DetailItem
                    label="Bid count"
                    value={displayVehicle.bid_count.toLocaleString()}
                  />
                  <DetailItem
                    label="Auction start"
                    value={formatAuctionDate(displayVehicle.auction_start)}
                  />
                </dl>
              </DetailSection>

              <DetailSection title="Condition">
                <dl className="vehicle-detail-grid">
                  <DetailItem
                    label="Condition grade"
                    value={formatConditionGrade(displayVehicle.condition_grade)}
                  />
                  <DetailItem label="Title status" value={displayVehicle.title_status ?? "N/A"} />
                </dl>
                <p className="vehicle-detail-copy">
                  {displayVehicle.condition_report ?? "Condition report unavailable."}
                </p>
                <div className="vehicle-detail-damage">
                  <h4>Damage notes</h4>
                  {displayVehicle.damage_notes.length ? (
                    <ul className="vehicle-detail-list">
                      {displayVehicle.damage_notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="vehicle-detail-copy">No damage notes listed.</p>
                  )}
                </div>
              </DetailSection>

              <DetailSection title="Seller and location">
                <dl className="vehicle-detail-grid">
                  <DetailItem
                    label="Selling dealership"
                    value={displayVehicle.selling_dealership ?? "N/A"}
                  />
                  <DetailItem label="Lot" value={displayVehicle.lot ?? "N/A"} />
                  <DetailItem label="City" value={displayVehicle.city ?? "N/A"} />
                  <DetailItem label="Province" value={displayVehicle.province ?? "N/A"} />
                  <DetailItem label="VIN" value={displayVehicle.vin} />
                  <DetailItem label="Vehicle ID" value={displayVehicle.id} />
                </dl>
              </DetailSection>
            </div>

            <section className="vehicle-detail-gallery">
              <div className="vehicle-detail-gallery-header">
                <div>
                  <p className="inventory-panel-label">Photos</p>
                  <h3>Full image set</h3>
                </div>
                <span className="inventory-results-pill">
                  {displayVehicle.images.length.toLocaleString()} images
                </span>
              </div>

              {displayVehicle.images.length ? (
                <div className="vehicle-detail-gallery-stack">
                  {displayVehicle.images.map((imageUrl, index) => (
                    <button
                      className="vehicle-detail-gallery-button"
                      key={`${imageUrl}-${index}`}
                      type="button"
                      onClick={() => onOpenImage(imageUrl)}
                    >
                      <img
                        alt={`${vehicleTitle} photo ${index + 1}`}
                        className="vehicle-detail-gallery-image"
                        loading="lazy"
                        src={imageUrl}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="vehicle-detail-feedback">No vehicle images available.</div>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
