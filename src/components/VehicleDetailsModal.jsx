import {
  formatAuctionDate,
  formatConditionGrade,
  formatCurrency,
  formatMilesFromKm,
} from "../inventoryConfig";
import WatchToggleButton from "./WatchToggleButton";

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
  errorMessage,
  isLoading,
  isWatchPending = false,
  onClose,
  onOpenImage,
  onToggleWatch,
  vehicle,
  watchErrorMessage = "",
}) {
  const vehicleTitle = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
        .filter(Boolean)
        .join(" ")
    : "Vehicle details";
  const summaryPrice = vehicle?.current_bid ?? vehicle?.starting_bid;
  const leadImageUrl = vehicle?.images[0] ?? "";
  const isWatched = Boolean(vehicle?.is_watched);
  const watchToggleLabel = isWatched
    ? `Remove ${vehicleTitle} from watchlist`
    : `Add ${vehicleTitle} to watchlist`;

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

        {!isLoading && !errorMessage && vehicle ? (
          <div className="vehicle-detail-content">
            <section className="vehicle-detail-top">
              {leadImageUrl ? (
                <button
                  className="vehicle-detail-hero-image-button"
                  type="button"
                  onClick={() => onOpenImage(leadImageUrl)}
                >
                  <div className="vehicle-detail-hero-badges">
                    <span className="vehicle-detail-hero-badge">
                      {vehicle.title_status ?? "N/A"}
                    </span>
                    <span className="vehicle-detail-hero-badge">
                      Grade {formatConditionGrade(vehicle.condition_grade)}
                    </span>
                  </div>
                  <img
                    alt={vehicleTitle}
                    className="vehicle-detail-hero-image"
                    src={leadImageUrl}
                  />
                </button>
              ) : null}

              <div className="vehicle-detail-summary">
                <div className="vehicle-detail-summary-primary">
                  <div className="vehicle-detail-summary-pills">
                    <span>{formatMilesFromKm(vehicle.odometer_km)}</span>
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
                    <dd>{formatAuctionDate(vehicle.auction_start)}</dd>
                  </div>
                  <div>
                    <dt>Starting bid</dt>
                    <dd>{formatCurrency(vehicle.starting_bid)}</dd>
                  </div>
                  <div>
                    <dt>Bid count</dt>
                    <dd>{vehicle.bid_count.toLocaleString()}</dd>
                  </div>
                </dl>
                {watchErrorMessage ? (
                  <div className="vehicle-detail-inline-message" role="status">
                    {watchErrorMessage}
                  </div>
                ) : null}
              </div>
            </section>

            <div className="vehicle-detail-sections">
              <DetailSection title="Vehicle specs">
                <dl className="vehicle-detail-grid">
                  <DetailItem label="Body style" value={vehicle.body_style ?? "N/A"} />
                  <DetailItem label="Exterior color" value={vehicle.exterior_color ?? "N/A"} />
                  <DetailItem label="Interior color" value={vehicle.interior_color ?? "N/A"} />
                  <DetailItem label="Engine" value={vehicle.engine ?? "N/A"} />
                  <DetailItem label="Transmission" value={vehicle.transmission ?? "N/A"} />
                  <DetailItem label="Drivetrain" value={vehicle.drivetrain ?? "N/A"} />
                  <DetailItem label="Fuel type" value={vehicle.fuel_type ?? "N/A"} />
                  <DetailItem label="Odometer" value={formatMilesFromKm(vehicle.odometer_km)} />
                </dl>
              </DetailSection>

              <DetailSection title="Auction and pricing">
                <dl className="vehicle-detail-grid">
                  <DetailItem label="Starting bid" value={formatCurrency(vehicle.starting_bid)} />
                  <DetailItem label="Current bid" value={formatCurrency(vehicle.current_bid)} />
                  <DetailItem label="Reserve price" value={formatCurrency(vehicle.reserve_price)} />
                  <DetailItem label="Buy now price" value={formatCurrency(vehicle.buy_now_price)} />
                  <DetailItem label="Bid count" value={vehicle.bid_count.toLocaleString()} />
                  <DetailItem label="Auction start" value={formatAuctionDate(vehicle.auction_start)} />
                </dl>
              </DetailSection>

              <DetailSection title="Condition">
                <dl className="vehicle-detail-grid">
                  <DetailItem
                    label="Condition grade"
                    value={formatConditionGrade(vehicle.condition_grade)}
                  />
                  <DetailItem label="Title status" value={vehicle.title_status ?? "N/A"} />
                </dl>
                <p className="vehicle-detail-copy">
                  {vehicle.condition_report ?? "Condition report unavailable."}
                </p>
                <div className="vehicle-detail-damage">
                  <h4>Damage notes</h4>
                  {vehicle.damage_notes.length ? (
                    <ul className="vehicle-detail-list">
                      {vehicle.damage_notes.map((note) => (
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
                    value={vehicle.selling_dealership ?? "N/A"}
                  />
                  <DetailItem label="Lot" value={vehicle.lot ?? "N/A"} />
                  <DetailItem label="City" value={vehicle.city ?? "N/A"} />
                  <DetailItem label="Province" value={vehicle.province ?? "N/A"} />
                  <DetailItem label="VIN" value={vehicle.vin} />
                  <DetailItem label="Vehicle ID" value={vehicle.id} />
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
                  {vehicle.images.length.toLocaleString()} images
                </span>
              </div>

              {vehicle.images.length ? (
                <div className="vehicle-detail-gallery-stack">
                  {vehicle.images.map((imageUrl, index) => (
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
