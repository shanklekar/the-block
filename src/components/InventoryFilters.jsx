import { formatRangeHint } from "../inventoryConfig";

function FilterField({
  field,
  filters,
  filterMetadata,
  onTextChange,
  onToggleCategorical,
  onRangeChange,
  onDateChange,
}) {
  if (field.type === "text") {
    return (
      <label className="filter-field" key={field.name}>
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

  if (field.type === "checkboxes") {
    const options = filterMetadata?.categorical?.[field.name] ?? [];
    const selectedOptions = filters.categorical[field.name];

    return (
      <fieldset className="filter-fieldset" key={field.name}>
        <legend className="filter-label">{field.label}</legend>
        <div className="filter-chip-grid">
          {options.map((option) => (
            <label className="filter-chip" key={option}>
              <input
                checked={selectedOptions.includes(option)}
                onChange={() => onToggleCategorical(field.name, option)}
                type="checkbox"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "range") {
    const hint = formatRangeHint(field, filterMetadata?.numeric?.[field.name]);
    const values = filters.range[field.name];

    return (
      <fieldset className="filter-fieldset" key={field.name}>
        <legend className="filter-label">{field.label}</legend>
        <div className="filter-range-row">
          <label className="filter-field">
            <span className="filter-sublabel">Min</span>
            <div className="filter-input-wrap">
              {field.prefix ? <span className="filter-prefix">{field.prefix}</span> : null}
              <input
                className="filter-input"
                inputMode={field.inputMode}
                step={field.step}
                type="number"
                value={values.min}
                onChange={(event) =>
                  onRangeChange(field.name, "min", event.target.value)
                }
              />
            </div>
          </label>
          <label className="filter-field">
            <span className="filter-sublabel">Max</span>
            <div className="filter-input-wrap">
              {field.prefix ? <span className="filter-prefix">{field.prefix}</span> : null}
              <input
                className="filter-input"
                inputMode={field.inputMode}
                step={field.step}
                type="number"
                value={values.max}
                onChange={(event) =>
                  onRangeChange(field.name, "max", event.target.value)
                }
              />
            </div>
          </label>
        </div>
        {hint ? <p className="filter-hint">Range: {hint}</p> : null}
      </fieldset>
    );
  }

  return (
    <fieldset className="filter-fieldset" key={field.name}>
      <legend className="filter-label">{field.label}</legend>
      <div className="filter-range-row">
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
          Inventory schedule spans {filterMetadata.datetime.auction_start.min} to{" "}
          {filterMetadata.datetime.auction_start.max}
        </p>
      ) : null}
    </fieldset>
  );
}

export default function InventoryFilters({
  allowedFields,
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
  panelId,
  panelLabel = "Search filters",
  title = "Refine inventory",
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="inventory-filters" id={panelId}>
      <div className="inventory-filters-header">
        <div>
          <p className="inventory-panel-label">{panelLabel}</p>
          <h2>{title}</h2>
        </div>
        <button className="inventory-close-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="inventory-filter-actions">
        <p className="inventory-filter-copy">
          Narrow the lane with the exact vehicle, location, pricing, and
          condition signals you care about.
        </p>
        <button className="inventory-clear-button" type="button" onClick={onClearFilters}>
          Clear all filters
        </button>
      </div>

      {isBootstrapping ? (
        <div className="inventory-filter-loading">Loading filters...</div>
      ) : (
        <div className="inventory-filter-groups">
          {filterGroups.map((group) => {
            const visibleFields = group.fields.filter((field) =>
              allowedFields.has(field.name),
            );

            if (!visibleFields.length) {
              return null;
            }

            return (
              <section className="inventory-filter-group" key={group.title}>
                <h3>{group.title}</h3>
                {visibleFields.map((field) => (
                  <FilterField
                    field={field}
                    filterMetadata={filterMetadata}
                    filters={filters}
                    key={field.name}
                    onDateChange={onDateChange}
                    onRangeChange={onRangeChange}
                    onTextChange={onTextChange}
                    onToggleCategorical={onToggleCategorical}
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
