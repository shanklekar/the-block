import { useEffect, useRef } from "react";
import {
  formatAuctionDate,
  formatConditionGrade,
  formatMilesFromKm,
} from "../inventoryConfig";
import { useVehicleLiveBidding } from "../useVehicleLiveBidding";
import BuyNowButton from "./BuyNowButton";
import VehicleBidPanel from "./VehicleBidPanel";
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
  currentUserId = null,
  isPurchased = false,
  showInlineBidding = false,
  onBidPlaced,
  onBuyNow,
  onSelect,
  onToggleWatch,
  onVehicleLiveStateChange,
  showWatchToggle = false,
  vehicle,
  watchTogglePending = false,
}) {
  const lastVehicleStateRef = useRef(null);
  const { biddingState, liveVehicle, stateErrorMessage } = useVehicleLiveBidding({
    apiBaseUrl,
    enabled: Boolean(vehicle?.id && showInlineBidding),
    fetchInitialState: showInlineBidding,
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
  const showBidPanel = Boolean(
    showInlineBidding &&
      biddingState?.auction_started &&
      !vehicleIsSold &&
      !vehicleIsPurchased,
  );
  const titleStatusClassName = getTitleStatusBadgeClassName(displayVehicle.title_status);

  useEffect(() => {
    if (!onVehicleLiveStateChange || !displayVehicle?.id) {
      return;
    }

    const nextVehicleState = {
      bid_count: displayVehicle.bid_count,
      current_bid: displayVehicle.current_bid,
      is_purchased: Boolean(displayVehicle.is_purchased),
      starting_bid: displayVehicle.starting_bid,
    };
    const previousVehicleState = lastVehicleStateRef.current;

    if (
      previousVehicleState &&
      previousVehicleState.bid_count === nextVehicleState.bid_count &&
      previousVehicleState.current_bid === nextVehicleState.current_bid &&
      previousVehicleState.is_purchased === nextVehicleState.is_purchased &&
      previousVehicleState.starting_bid === nextVehicleState.starting_bid
    ) {
      return;
    }

    lastVehicleStateRef.current = nextVehicleState;
    onVehicleLiveStateChange(displayVehicle.id, nextVehicleState);
  }, [
    displayVehicle?.bid_count,
    displayVehicle?.current_bid,
    displayVehicle?.id,
    displayVehicle?.is_purchased,
    displayVehicle?.starting_bid,
    onVehicleLiveStateChange,
  ]);

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

        {showBuyNowButton || showBidPanel ? (
          <div className="vehicle-card-footer">
            {showBuyNowButton ? (
              <div className="vehicle-card-actions">
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
              </div>
            ) : null}

            {showBidPanel ? (
              <div
                className="vehicle-card-bid-panel"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <VehicleBidPanel
                  apiBaseUrl={apiBaseUrl}
                  biddingState={biddingState}
                  displayVehicle={displayVehicle}
                  isPurchased={vehicleIsPurchased}
                  onBidPlaced={onBidPlaced}
                  stateErrorMessage={stateErrorMessage}
                  userId={currentUserId}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
