import {
  formatAuctionDate,
  formatCurrency,
  formatMilesFromKm,
} from "../inventoryConfig";

export default function VehicleCard({ vehicle }) {
  const primaryImage =
    vehicle.images[0] ??
    "https://placehold.co/800x600/1a1a2e/eaeaea?text=Vehicle+Image";
  const vehicleTitle = `${vehicle.make} ${vehicle.year} ${vehicle.model}`;
  const vehicleGrade =
    typeof vehicle.condition_grade === "number"
      ? vehicle.condition_grade.toFixed(1)
      : "N/A";

  return (
    <article className="vehicle-card">
      <div className="vehicle-card-media">
        <img
          alt={vehicleTitle}
          className="vehicle-card-image"
          loading="lazy"
          src={primaryImage}
        />
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
