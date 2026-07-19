import { SORT_OPTIONS } from "../inventoryConfig";
import VehicleCard from "./VehicleCard";

function LoadingCards() {
  return (
    <div className="vehicle-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <article className="vehicle-card vehicle-card-skeleton" key={index}>
          <div className="vehicle-card-media" />
          <div className="vehicle-card-body">
            <div className="skeleton-line skeleton-line-title" />
            <div className="skeleton-line skeleton-line-text" />
            <div className="skeleton-line skeleton-line-text" />
            <div className="skeleton-line skeleton-line-short" />
          </div>
        </article>
      ))}
    </div>
  );
}

export default function InventoryResults({
  apiBaseUrl = "",
  activeFilterCount,
  biddingEnabledVehicleIds = {},
  collapseLabel = "Section",
  currentUserId = null,
  emptyStateMessage = "No vehicles match your criteria.",
  errorMessage,
  filterPanelId,
  filtersOpen,
  filtersPanel,
  hasMore,
  isBootstrapping,
  isInitialLoading,
  isLoadingMore,
  isSectionCollapsed = false,
  onBidPlaced,
  onBiddingToggleChange,
  onRequestBuyNow,
  onSelectVehicle,
  onSortChange,
  onToggleWatch,
  onToggleFilters,
  onToggleSectionCollapsed,
  onVehicleLiveStateChange,
  panelLabel = "Live search results",
  purchasedVehicleIds = {},
  pendingWatchVehicleIds = [],
  resultsSentinelRef,
  sectionCollapseEnabled = false,
  sortLabel = "Sort by",
  sortOptionId,
  showInlineBidding = false,
  title = "Inventory results",
  totalVehicles,
  vehicles,
  watchMutationErrorMessage = "",
  watchToggleEnabled = false,
}) {
  const showEmptyState =
    !isBootstrapping && !isInitialLoading && !errorMessage && vehicles.length === 0;

  return (
    <section
      className={`inventory-results ${isSectionCollapsed ? "is-collapsed" : ""}`.trim()}
    >
      <header className="inventory-results-header">
        <div>
          <p className="inventory-panel-label">{panelLabel}</p>
          <h2>{title}</h2>
        </div>
        <div className="inventory-results-meta">
          {sectionCollapseEnabled ? (
            <button
              aria-expanded={!isSectionCollapsed}
              className="inventory-section-toggle"
              type="button"
              onClick={onToggleSectionCollapsed}
            >
              {isSectionCollapsed ? `Expand ${collapseLabel}` : `Collapse ${collapseLabel}`}
            </button>
          ) : null}
          <div className="inventory-results-controls">
            <button
              aria-controls={filterPanelId}
              aria-expanded={filtersOpen}
              className={`inventory-filter-toggle ${filtersOpen ? "is-active" : ""}`}
              type="button"
              onClick={onToggleFilters}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
          <label className="inventory-results-sort">
            <span className="inventory-results-sort-label">{sortLabel}</span>
            <select
              className="inventory-results-sort-select"
              value={sortOptionId}
              onChange={(event) => onSortChange(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="inventory-results-pill">
            Showing {vehicles.length.toLocaleString()}
          </span>
          {isInitialLoading ? (
            <span className="inventory-results-pill inventory-results-pill-active">
              Loading inventory...
            </span>
          ) : null}
        </div>
      </header>

      {!isSectionCollapsed ? (
        <>
          {filtersPanel}

          {errorMessage ? <div className="inventory-feedback error">{errorMessage}</div> : null}
          {watchMutationErrorMessage ? (
            <div className="inventory-inline-message" role="status">
              {watchMutationErrorMessage}
            </div>
          ) : null}

          {isBootstrapping || isInitialLoading ? <LoadingCards /> : null}

          {!isBootstrapping && !isInitialLoading && vehicles.length > 0 ? (
            <div className="vehicle-grid">
              {vehicles.map((vehicle) => (
                <VehicleCard
                  apiBaseUrl={apiBaseUrl}
                  currentUserId={currentUserId}
                  isBiddingEnabled={Boolean(biddingEnabledVehicleIds[vehicle.id])}
                  isPurchased={Boolean(
                    vehicle.is_purchased_by_user || purchasedVehicleIds[vehicle.id],
                  )}
                  key={vehicle.id}
                  showInlineBidding={showInlineBidding}
                  onBidPlaced={onBidPlaced}
                  onBiddingToggleChange={(isEnabled) =>
                    onBiddingToggleChange?.(vehicle.id, isEnabled)
                  }
                  onBuyNow={onRequestBuyNow}
                  onSelect={onSelectVehicle}
                  onToggleWatch={onToggleWatch}
                  onVehicleLiveStateChange={onVehicleLiveStateChange}
                  showWatchToggle={watchToggleEnabled}
                  watchTogglePending={pendingWatchVehicleIds.includes(vehicle.id)}
                  vehicle={vehicle}
                />
              ))}
            </div>
          ) : null}

          {showEmptyState ? (
            <div className="inventory-feedback empty">{emptyStateMessage}</div>
          ) : null}

          {!showEmptyState && vehicles.length > 0 ? (
            <div className="inventory-scroll-status">
              {isLoadingMore ? (
                <span className="inventory-results-pill inventory-results-pill-active">
                  Loading more vehicles...
                </span>
              ) : null}
              {!hasMore ? (
                <span className="inventory-results-pill">You&apos;ve reached the end.</span>
              ) : null}
            </div>
          ) : null}

          <div className="inventory-results-sentinel" ref={resultsSentinelRef} />
        </>
      ) : null}
    </section>
  );
}
