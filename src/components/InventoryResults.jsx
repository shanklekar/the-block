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
  errorMessage,
  hasMore,
  isBootstrapping,
  isInitialLoading,
  isLoadingMore,
  onSelectVehicle,
  onSortChange,
  resultsSentinelRef,
  sortOptionId,
  totalVehicles,
  vehicles,
}) {
  const showEmptyState =
    !isBootstrapping && !isInitialLoading && !errorMessage && vehicles.length === 0;

  return (
    <section className="inventory-results">
      <header className="inventory-results-header">
        <div>
          <p className="inventory-panel-label">Live search results</p>
          <h2>
            {totalVehicles > 0
              ? `${totalVehicles.toLocaleString()} vehicles ready to review`
              : "Inventory results"}
          </h2>
        </div>
        <div className="inventory-results-meta">
          <label className="inventory-results-sort">
            <span className="inventory-results-sort-label">Sort by</span>
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

      {errorMessage ? <div className="inventory-feedback error">{errorMessage}</div> : null}

      {isBootstrapping || isInitialLoading ? <LoadingCards /> : null}

      {!isBootstrapping && !isInitialLoading && vehicles.length > 0 ? (
        <div className="vehicle-grid">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              onSelect={onSelectVehicle}
              vehicle={vehicle}
            />
          ))}
        </div>
      ) : null}

      {showEmptyState ? (
        <div className="inventory-feedback empty">No vehicles match your criteria.</div>
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
    </section>
  );
}
