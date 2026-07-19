import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventoryResults from "../InventoryResults";

vi.mock("../VehicleCard", () => ({
  default: function VehicleCardMock({
    onSelect,
    onToggleWatch,
    showWatchToggle,
    vehicle,
    watchTogglePending,
  }) {
    return (
      <article data-testid={`vehicle-card-${vehicle.id}`}>
        <h3>{vehicle.make}</h3>
        <button type="button" onClick={() => onSelect(vehicle.id)}>
          Open {vehicle.id}
        </button>
        {showWatchToggle ? (
          <button
            disabled={watchTogglePending}
            type="button"
            onClick={() => onToggleWatch(vehicle.id, !vehicle.is_watched)}
          >
            Toggle watch {vehicle.id}
          </button>
        ) : null}
      </article>
    );
  },
}));

describe("InventoryResults", () => {
  it("renders empty state and active filter count", () => {
    render(
      <InventoryResults
        activeFilterCount={2}
        filterPanelId="filters"
        filtersOpen={false}
        filtersPanel={<div>Filters panel</div>}
        hasMore={false}
        isBootstrapping={false}
        isInitialLoading={false}
        isLoadingMore={false}
        onRequestBuyNow={vi.fn()}
        onSelectVehicle={vi.fn()}
        onSortChange={vi.fn()}
        onToggleFilters={vi.fn()}
        sortOptionId="auction_start_asc"
        totalVehicles={0}
        vehicles={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Filters (2)" })).toBeInTheDocument();
    expect(screen.getByText("No vehicles match your criteria.")).toBeInTheDocument();
  });

  it("passes watch interactions through to vehicle cards", async () => {
    const user = userEvent.setup();
    const onSelectVehicle = vi.fn();
    const onToggleWatch = vi.fn();

    render(
      <InventoryResults
        activeFilterCount={0}
        currentUserId={1}
        filterPanelId="filters"
        filtersOpen={true}
        filtersPanel={<div>Filters panel</div>}
        hasMore={true}
        isBootstrapping={false}
        isInitialLoading={false}
        isLoadingMore={false}
        onRequestBuyNow={vi.fn()}
        onSelectVehicle={onSelectVehicle}
        onSortChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleWatch={onToggleWatch}
        pendingWatchVehicleIds={[7]}
        sortOptionId="auction_start_asc"
        totalVehicles={1}
        vehicles={[
          {
            id: 7,
            is_watched: false,
            make: "Honda",
          },
        ]}
        watchToggleEnabled
      />,
    );

    expect(screen.getByText("Showing 1")).toBeInTheDocument();
    expect(screen.getByTestId("vehicle-card-7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle watch 7" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Open 7" }));
    expect(onSelectVehicle).toHaveBeenCalledWith(7);
    expect(onToggleWatch).not.toHaveBeenCalled();
  });
});
