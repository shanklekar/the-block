import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventoryFilters from "../InventoryFilters";

vi.mock("../SearchableCheckboxSelector", () => ({
  default: function SearchableCheckboxSelectorMock({ field, onToggle, selectedValues }) {
    return (
      <button type="button" onClick={() => onToggle(field.name, "Honda")}>
        {field.label} ({selectedValues.length})
      </button>
    );
  },
}));

describe("InventoryFilters", () => {
  const filterGroups = [
    {
      title: "Vehicle",
      fields: [
        { label: "VIN", name: "vin", placeholder: "Search VIN", type: "text" },
        { label: "Make", name: "make", type: "searchable-checkboxes" },
        { inputMode: "numeric", label: "Miles", name: "odometer_km", step: 100, type: "range" },
        { label: "Buy Now Available", name: "buy_now_available", type: "toggle" },
        { label: "Auction Start", name: "auction_start", type: "datetime" },
      ],
    },
  ];

  const filters = {
    text: { vin: "" },
    categorical: { make: ["Ford"] },
    range: { odometer_km: { min: "", max: "" } },
    datetime: { auction_start: { min: "", max: "" } },
    flags: { buy_now_available: false },
  };

  it("renders only allowed fields and routes interactions to the right callbacks", async () => {
    const user = userEvent.setup();
    const onTextChange = vi.fn();
    const onToggleCategorical = vi.fn();
    const onRangeChange = vi.fn();
    const onFlagChange = vi.fn();
    const onDateChange = vi.fn();
    const onClearFilters = vi.fn();
    const onClose = vi.fn();

    render(
      <InventoryFilters
        allowedFields={new Set(["vin", "make", "odometer_km", "buy_now_available", "auction_start"])}
        criteria={{ match: "and", rules: [] }}
        filterGroups={filterGroups}
        filterMetadata={{
          datetime: {
            auction_start: {
              max: "2026-07-20T16:00:00Z",
              min: "2026-07-19T14:00:00Z",
            },
          },
          numeric: {
            odometer_km: {
              max: 120000,
              min: 10000,
            },
          },
        }}
        filters={filters}
        isBootstrapping={false}
        isOpen
        onClearFilters={onClearFilters}
        onClose={onClose}
        onDateChange={onDateChange}
        onFlagChange={onFlagChange}
        onRangeChange={onRangeChange}
        onTextChange={onTextChange}
        onToggleCategorical={onToggleCategorical}
        optionsEndpoint="/api/filter-options"
        panelId="inventory-filters"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search VIN"), {
      target: { value: "ABC" },
    });
    expect(onTextChange).toHaveBeenCalledWith("vin", "ABC");

    await user.click(screen.getByRole("button", { name: "Make (1)" }));
    expect(onToggleCategorical).toHaveBeenCalledWith("make", "Honda");

    const minRangeInput = screen.getByRole("spinbutton", { name: "Min" });
    const maxRangeInput = screen.getByRole("spinbutton", { name: "Max" });
    fireEvent.change(minRangeInput, { target: { value: "50" } });
    fireEvent.change(maxRangeInput, { target: { value: "75" } });
    expect(onRangeChange).toHaveBeenCalledWith("odometer_km", "min", "50");
    expect(onRangeChange).toHaveBeenCalledWith("odometer_km", "max", "75");

    await user.click(screen.getByRole("checkbox", { name: "Buy Now Available" }));
    expect(onFlagChange).toHaveBeenCalledWith("buy_now_available", true);

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-19T09:30" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-20T09:30" },
    });
    expect(onDateChange).toHaveBeenCalledWith("min", "2026-07-19T09:30");
    expect(onDateChange).toHaveBeenCalledWith("max", "2026-07-20T09:30");

    expect(screen.getByText(/inventory schedule spans/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a loading state while bootstrapping", () => {
    render(
      <InventoryFilters
        allowedFields={new Set(["vin"])}
        criteria={{ match: "and", rules: [] }}
        filterGroups={filterGroups}
        filters={filters}
        isBootstrapping
        isOpen
        onClearFilters={vi.fn()}
        onClose={vi.fn()}
        onDateChange={vi.fn()}
        onFlagChange={vi.fn()}
        onRangeChange={vi.fn()}
        onTextChange={vi.fn()}
        onToggleCategorical={vi.fn()}
        panelId="inventory-filters"
      />,
    );

    expect(screen.getByText("Loading filters...")).toBeInTheDocument();
  });
});
