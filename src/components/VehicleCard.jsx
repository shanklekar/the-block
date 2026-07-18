import {
  formatAuctionDate,
  formatConditionGrade,
  formatCurrency,
  formatMilesFromKm,
} from "../inventoryConfig";
import { useVehicleLiveBidding } from "../useVehicleLiveBidding";
import BidNowButton from "./BidNowButton";
import BuyNowButton from "./BuyNowButton";
import WatchToggleButton from "./WatchToggleButton";

function getTitleStatusBadgeClassName(titleStatus) {
  const normalizedTitleStatus = titleStatus?.trim().toLowerCase();

  if (normalizedTitleStatus === "salvage") {
    return " vehicle-card-badge-danger";
  }

  if (normalizedTitleStatus === "clean") {
    return "";
  }

  return " vehicle-card-badge-warning";
}

export default function VehicleCard({
  apiBaseUrl = "",
  bidActionMode = "active-only",
  currentUserId = null,
  isPurchased = false,
  onBuyNow,
  onRequestBid,
  onSelect,
  onToggleWatch,
  showWatchToggle = false,
  vehicle,
  watchTogglePending = false,
}) {
  const { biddingState, canBid, liveVehicle } = useVehicleLiveBidding({
    apiBaseUrl,
    enabled: bidActionMode === "active-only",
    userId: currentUserId,
    vehicle,
  });
  const displayVehicle = liveVehicle ?? vehicle;
  const primaryImage =
    displayVehicle.images[0] ??
    "https://placehold.co/800x600/1a1a2e/eaeaea?text=Vehicle+Image";
  const vehicleTitle = [
    displayVehicle.year,
    displayVehicle.make,
    displayVehicle.model,
    displayVehicle.trim,
  ]
    .filter(Boolean)
    .join(" ");
  const vehicleGrade = formatConditionGrade(displayVehicle.condition_grade);
  const isWatched = Boolean(displayVehicle.is_watched);
  const watchToggleLabel = isWatched
    ? `Remove ${vehicleTitle} from watchlist`
    : `Add ${vehicleTitle} to watchlist`;
  const vehicleIsPurchased = Boolean(isPurchased || displayVehicle.is_purchased_by_user);
  const vehicleIsSold = Boolean(displayVehicle.is_purchased);
  const showBuyNowButton =
    Number(displayVehicle.buy_now_price) > 0 && (vehicleIsPurchased || !vehicleIsSold);
  const minimumNextBid = biddingState?.minimum_next_bid ?? null;
  const showActiveBidButton =
    bidActionMode === "active-only" &&
    canBid &&
    !vehicleIsSold &&
    !vehicleIsPurchased &&
    minimumNextBid;
  const titleStatusClassName = getTitleStatusBadgeClassName(displayVehicle.title_status);

  return (
    <article
      className="vehicle-card"
      onClick={() => onSelect(displayVehicle.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(displayVehicle.id);
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
              onToggleWatch?.(displayVehicle.id, !isWatched);
            }}
          />
        ) : null}
        <div className="vehicle-card-badge-row">
          <span className={`vehicle-card-badge${titleStatusClassName}`}>
            {displayVehicle.title_status ?? "Untitled"}
          </span>
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
            <dt>Location</dt>
            <dd>
              {displayVehicle.city ?? "Unknown"}, {displayVehicle.province ?? "N/A"}
            </dd>
          </div>
          <div>
            <dt>Auction</dt>
            <dd>{formatAuctionDate(displayVehicle.auction_start)}</dd>
          </div>
        </dl>

        {showActiveBidButton || showBuyNowButton ? (
          <div className="vehicle-card-actions">
            {showBuyNowButton ? (
              <div
                className="vehicle-card-buy-now"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <BuyNowButton
                  isPurchased={vehicleIsPurchased}
                  price={displayVehicle.buy_now_price}
                  onClick={(event) => {
                    event.stopPropagation();
                    onBuyNow?.(displayVehicle);
                  }}
                />
              </div>
            ) : null}

            {showActiveBidButton ? (
              <div
                className="vehicle-card-bid-now"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <BidNowButton
                  amount={minimumNextBid}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRequestBid?.(displayVehicle);
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
