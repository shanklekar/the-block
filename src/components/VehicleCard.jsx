import {
  formatAuctionDate,
  formatConditionGrade,
  formatCurrency,
  formatMilesFromKm,
} from "../inventoryConfig";
import WatchToggleButton from "./WatchToggleButton";

export default function VehicleCard({
  onSelect,
  onToggleWatch,
  showWatchToggle = false,
  vehicle,
  watchTogglePending = false,
}) {
  const primaryImage =
    vehicle.images[0] ??
    "https://placehold.co/800x600/1a1a2e/eaeaea?text=Vehicle+Image";
  const vehicleTitle = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const vehicleGrade = formatConditionGrade(vehicle.condition_grade);
  const isWatched = Boolean(vehicle.is_watched);
  const watchToggleLabel = isWatched
    ? `Remove ${vehicleTitle} from watchlist`
    : `Add ${vehicleTitle} to watchlist`;

  return (
    <article
      className="vehicle-card"
      onClick={() => onSelect(vehicle.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(vehicle.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="vehicle-card-media">
        <img
          alt={vehicleTitle}
          className="vehicle-card-image"
          loading="lazy"
          src={primaryImage}
        />
        {showWatchToggle ? (
          <WatchToggleButton
            disabled={watchTogglePending}
            isWatched={isWatched}
            label={watchToggleLabel}
            onToggle={(event) => {
              event.stopPropagation();
              onToggleWatch?.(vehicle.id, !isWatched);
            }}
          />
        ) : null}
        <div className="vehicle-card-badge-row">
          <span className="vehicle-card-badge">{vehicle.title_status ?? "Untitled"}</span>
          <span className="vehicle-card-badge">{vehicleGrade}</span>
        </div>
      </div>

      <div className="vehicle-card-body">
        <div className="vehicle-card-heading">
          <h3>{vehicleTitle}</h3>
          <p className="vehicle-card-subtitle">{formatMilesFromKm(vehicle.odometer_km)}</p>
        </div>

        <dl className="vehicle-card-specs">
          <div>
            <dt>Trim</dt>
            <dd>{vehicle.trim ?? "N/A"}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {vehicle.city ?? "Unknown"}, {vehicle.province ?? "N/A"}
            </dd>
          </div>
          <div>
            <dt>Current bid</dt>
            <dd>{formatCurrency(vehicle.current_bid ?? vehicle.starting_bid)}</dd>
          </div>
          <div>
            <dt>Auction</dt>
            <dd>{formatAuctionDate(vehicle.auction_start)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
