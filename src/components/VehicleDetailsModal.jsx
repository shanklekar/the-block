import { useEffect, useRef, useState } from "react";
import { formatConditionGrade, formatMilesFromKm } from "../inventoryConfig";
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

function formatDetailValue(value) {
  if (typeof value !== "string" || !value.length) {
    return value;
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function DetailItem({ label, value }) {
  return (
    <div className="vehicle-detail-item">
      <dt>{label}</dt>
      <dd>{formatDetailValue(value)}</dd>
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

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CopiedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m5 12.5 4.2 4.2L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
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
  const copyFeedbackTimeoutRef = useRef(null);
  const [copiedField, setCopiedField] = useState("");
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
  const formattedMiles = displayVehicle
    ? formatMilesFromKm(displayVehicle.odometer_km)
    : "";
  const hasVin = Boolean(displayVehicle?.vin);
  const hasSidePanelContent = Boolean(
    showBidPanel || showBuyNowButton || watchErrorMessage || purchaseMessage,
  );

  useEffect(() => {
    if (!showBidPanel && stateErrorMessage) {
      console.error("[VehicleDetailsModal] Live bidding state error:", stateErrorMessage);
    }
  }, [showBidPanel, stateErrorMessage]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCopiedField("");
  }, [displayVehicle?.id]);

  async function handleCopyValue(fieldName, value) {
    if (!value || !navigator?.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);

      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }

      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopiedField("");
      }, 1800);
    } catch {
      setCopiedField("");
    }
  }

  return (
    <div className="modal-shell vehicle-detail-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <section className="vehicle-detail-modal">
        <header className="vehicle-detail-header">
          <div className="vehicle-detail-header-copy">
            <p className="inventory-panel-label">Vehicle details</p>
            {displayVehicle ? <h2>{vehicleTitle}</h2> : null}
          </div>
          <div className="vehicle-detail-header-actions">
            {displayVehicle ? (
              <WatchToggleButton
                className="vehicle-watch-toggle-detail"
                disabled={isWatchPending}
                isWatched={isWatched}
                label={watchToggleLabel}
                onToggle={onToggleWatch}
                variant="modal-header"
              />
            ) : null}
            <button className="modal-close-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="vehicle-detail-feedback">Loading vehicle details...</div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="vehicle-detail-feedback error">{errorMessage}</div>
        ) : null}

        {!isLoading && !errorMessage && displayVehicle ? (
          <div className="vehicle-detail-content">
            <section
              className={`vehicle-detail-top ${hasSidePanelContent ? "" : "vehicle-detail-top-single"}`.trim()}
            >
              <div className="vehicle-detail-hero-stack">
                {leadImageUrl ? (
                  <button
                    className="vehicle-detail-hero-image-button"
                    type="button"
                    onClick={() => onOpenImage(displayVehicle.images, 0)}
                  >
                    <img
                      alt={vehicleTitle}
                      className="vehicle-detail-hero-image"
                      src={leadImageUrl}
                    />
                    <div className="vehicle-detail-hero-overlay">
                      <div className="vehicle-detail-hero-badges">
                        <span
                          className={`vehicle-detail-hero-badge${titleStatusBadgeClassName}`}
                        >
                          {displayVehicle.title_status ?? "N/A"}
                        </span>
                        <span className="vehicle-detail-hero-badge">
                          {formatConditionGrade(displayVehicle.condition_grade)}
                        </span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="vehicle-detail-hero-fallback">
                    <div className="vehicle-detail-hero-badges">
                      <span
                        className={`vehicle-detail-hero-badge${titleStatusBadgeClassName}`}
                      >
                        {displayVehicle.title_status ?? "N/A"}
                      </span>
                      <span className="vehicle-detail-hero-badge">
                        {formatConditionGrade(displayVehicle.condition_grade)}
                      </span>
                    </div>
                  </div>
                )}

                <dl className="vehicle-detail-meta-card">
                  <div className="vehicle-detail-meta-item">
                    <dd>{formattedMiles}</dd>
                  </div>
                  <div className="vehicle-detail-meta-item vehicle-detail-meta-item-vin">
                    <dd>{displayVehicle.vin ?? "N/A"}</dd>
                  </div>
                  <button
                    aria-label={
                      copiedField === "vin"
                        ? `Copied VIN ${displayVehicle.vin}`
                        : `Copy VIN ${displayVehicle.vin} to clipboard`
                    }
                    className={`vehicle-card-copy-button ${copiedField === "vin" ? "is-copied" : ""}`}
                    disabled={!hasVin}
                    type="button"
                    onClick={() => handleCopyValue("vin", displayVehicle.vin)}
                  >
                    {copiedField === "vin" ? <CopiedIcon /> : <CopyIcon />}
                  </button>
                </dl>
              </div>

              {hasSidePanelContent ? (
                <div className="vehicle-detail-side-panel">
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

                  {showBuyNowButton ? (
                    <BuyNowButton
                      className="vehicle-buy-now-detail"
                      isPurchased={vehicleIsPurchased}
                      price={displayVehicle.buy_now_price}
                      onClick={() => onBuyNow?.(displayVehicle)}
                    />
                  ) : null}

                  {watchErrorMessage ? (
                    <div className="vehicle-detail-inline-message error" role="status">
                      {watchErrorMessage}
                    </div>
                  ) : null}

                  {purchaseMessage ? (
                    <div className="vehicle-detail-inline-message" role="status">
                      {purchaseMessage}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                  <DetailItem label="City" value={displayVehicle.city ?? "N/A"} />
                  <DetailItem label="Province" value={displayVehicle.province ?? "N/A"} />
                </dl>
              </DetailSection>
            </div>

            <section className="vehicle-detail-gallery">
              <div className="vehicle-detail-gallery-header">
                <div>
                  <p className="inventory-panel-label">Photos</p>
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
                      onClick={() => onOpenImage(displayVehicle.images, index)}
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
