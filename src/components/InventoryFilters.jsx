import {
  formatAuctionScheduleSpan,
  formatRangeHint,
} from "../inventoryConfig";
import SearchableCheckboxSelector from "./SearchableCheckboxSelector";

function FilterField({
  criteria,
  field,
  filterMetadata,
  filters,
  onDateChange,
  onRangeChange,
  onTextChange,
  onToggleCategorical,
  optionsEndpoint,
}) {
  if (field.type === "text") {
    return (
      <label className="filter-field">
        <span className="filter-label">{field.label}</span>
        <input
          className="filter-input"
          type="text"
          value={filters.text[field.name]}
          placeholder={field.placeholder}
          onChange={(event) => onTextChange(field.name, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "searchable-checkboxes") {
    return (
      <SearchableCheckboxSelector
        criteria={criteria}
        fallbackOptions={filterMetadata?.categorical?.[field.name] ?? []}
        field={field}
        optionsEndpoint={optionsEndpoint}
        selectedValues={filters.categorical[field.name] ?? []}
        onToggle={onToggleCategorical}
      />
    );
  }

  if (field.type === "range") {
    const hint = formatRangeHint(field, filterMetadata?.numeric?.[field.name]);
    const values = filters.range[field.name];

    return (
      <fieldset className="filter-fieldset">
        <legend className="filter-label">{field.label}</legend>
        <div className="filter-range-stack">
          <label className="filter-field">
            <span className="filter-sublabel">Min</span>
            <div className="filter-input-wrap">
              {field.prefix ? <span className="filter-prefix">{field.prefix}</span> : null}
              <input
                className="filter-input filter-input-number"
                inputMode={field.inputMode}
                step={field.step}
                type="number"
                value={values.min}
                onChange={(event) => onRangeChange(field.name, "min", event.target.value)}
              />
            </div>
          </label>
          <label className="filter-field">
            <span className="filter-sublabel">Max</span>
            <div className="filter-input-wrap">
              {field.prefix ? <span className="filter-prefix">{field.prefix}</span> : null}
              <input
                className="filter-input filter-input-number"
                inputMode={field.inputMode}
                step={field.step}
                type="number"
                value={values.max}
                onChange={(event) => onRangeChange(field.name, "max", event.target.value)}
              />
            </div>
          </label>
        </div>
        {hint ? <p className="filter-hint">Range: {hint}</p> : null}
      </fieldset>
    );
  }

  return (
    <fieldset className="filter-fieldset">
      <legend className="filter-label">{field.label}</legend>
      <div className="filter-range-stack">
        <label className="filter-field">
          <span className="filter-sublabel">From</span>
          <input
            className="filter-input"
            type="datetime-local"
            value={filters.datetime.auction_start.min}
            onChange={(event) => onDateChange("min", event.target.value)}
          />
        </label>
        <label className="filter-field">
          <span className="filter-sublabel">To</span>
          <input
            className="filter-input"
            type="datetime-local"
            value={filters.datetime.auction_start.max}
            onChange={(event) => onDateChange("max", event.target.value)}
          />
        </label>
      </div>
      {filterMetadata?.datetime?.auction_start?.min &&
      filterMetadata?.datetime?.auction_start?.max ? (
        <p className="filter-hint">
          Inventory schedule spans{" "}
          {formatAuctionScheduleSpan(filterMetadata.datetime.auction_start.min)} to{" "}
          {formatAuctionScheduleSpan(filterMetadata.datetime.auction_start.max)}
        </p>
      ) : null}
    </fieldset>
  );
}

export default function InventoryFilters({
  allowedFields,
  criteria,
  filterGroups,
  filterMetadata,
  filters,
  isBootstrapping,
  isOpen,
  onClearFilters,
  onClose,
  onDateChange,
  onRangeChange,
  onTextChange,
  onToggleCategorical,
  optionsEndpoint,
  panelId,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="inventory-filters" id={panelId}>
      <div className="inventory-filter-actions">
        <button className="inventory-clear-button" type="button" onClick={onClearFilters}>
          Clear all filters
        </button>
        <button className="inventory-close-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {isBootstrapping ? (
        <div className="inventory-filter-loading">Loading filters...</div>
      ) : (
        <div className="inventory-filter-groups">
          {filterGroups.map((group) => {
            const visibleFields = group.fields.filter((field) => allowedFields.has(field.name));

            if (!visibleFields.length) {
              return null;
            }

            return (
              <section className="inventory-filter-group" key={group.title}>
                <h3>{group.title}</h3>
                {visibleFields.map((field) => (
                  <FilterField
                    criteria={criteria}
                    field={field}
                    filterMetadata={filterMetadata}
                    filters={filters}
                    key={field.name}
                    onDateChange={onDateChange}
                    onRangeChange={onRangeChange}
                    onTextChange={onTextChange}
                    onToggleCategorical={onToggleCategorical}
                    optionsEndpoint={optionsEndpoint}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
