import { useEffect, useRef, useState } from "react";

function buildFallbackOptions(options) {
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : option,
  );
}

function buildSummary(selectedValues, selectedOptionMap, label) {
  if (!selectedValues.length) {
    return `Select ${label.toLowerCase()}`;
  }

  if (selectedValues.length === 1) {
    return selectedOptionMap.get(selectedValues[0])?.label ?? selectedValues[0];
  }

  const firstLabel = selectedOptionMap.get(selectedValues[0])?.label ?? selectedValues[0];
  return `${firstLabel} +${selectedValues.length - 1}`;
}

export default function SearchableCheckboxSelector({
  criteria,
  fallbackOptions = [],
  field,
  optionsEndpoint = "",
  selectedValues = [],
  onToggle,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(buildFallbackOptions(fallbackOptions));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const rootRef = useRef(null);
  const selectorMode = field.selectorMode ?? "inline";
  const criteriaKey = JSON.stringify(criteria);
  const shouldFetchOptions = selectorMode === "inline" || isOpen;

  useEffect(() => {
    setOptions(buildFallbackOptions(fallbackOptions));
  }, [fallbackOptions]);

  useEffect(() => {
    if (selectorMode !== "dropdown" || !isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, selectorMode]);

  useEffect(() => {
    if (!optionsEndpoint || !shouldFetchOptions) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await fetch(optionsEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            field: field.name,
            query,
            criteria,
            limit: 75,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to load filter options.");
        }

        const payload = await response.json();

        setOptions(Array.isArray(payload.options) ? payload.options : []);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage("Couldn't load options right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [criteriaKey, field.name, optionsEndpoint, query, shouldFetchOptions]);

  const optionMap = new Map();

  for (const option of options) {
    optionMap.set(option.value, option);
  }

  for (const option of buildFallbackOptions(fallbackOptions)) {
    if (!optionMap.has(option.value)) {
      optionMap.set(option.value, option);
    }
  }

  for (const selectedValue of selectedValues) {
    if (!optionMap.has(selectedValue)) {
      optionMap.set(selectedValue, {
        value: selectedValue,
        label: selectedValue,
      });
    }
  }

  const mergedOptions = Array.from(optionMap.values()).sort((left, right) => {
    const leftSelected = selectedValues.includes(left.value);
    const rightSelected = selectedValues.includes(right.value);

    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });

  const selectorContent = (
    <>
      <input
        className="filter-input filter-selector-search"
        type="text"
        value={query}
        placeholder={`Type to search ${field.label.toLowerCase()}`}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="filter-option-list" role="group" aria-label={field.label}>
        {mergedOptions.map((option) => (
          <label
            className={`filter-option ${selectedValues.includes(option.value) ? "is-selected" : ""}`}
            key={option.value}
          >
            <input
              checked={selectedValues.includes(option.value)}
              onChange={() => onToggle(field.name, option.value)}
              type="checkbox"
            />
            <span>{option.label}</span>
          </label>
        ))}
        {!isLoading && !mergedOptions.length ? (
          <p className="filter-option-empty">No matching options.</p>
        ) : null}
      </div>
      {isLoading ? <p className="filter-selector-status">Loading options...</p> : null}
      {errorMessage ? <p className="filter-selector-status">{errorMessage}</p> : null}
    </>
  );

  return (
    <fieldset className="filter-fieldset" key={field.name}>
      <legend className="filter-label">{field.label}</legend>
      <div
        className={`filter-selector filter-selector-${selectorMode}`}
        ref={rootRef}
      >
        {selectorMode === "dropdown" ? (
          <>
            <button
              aria-expanded={isOpen}
              className="filter-selector-trigger"
              type="button"
              onClick={() => setIsOpen((currentOpen) => !currentOpen)}
            >
              <span>{buildSummary(selectedValues, optionMap, field.label)}</span>
              <span className="filter-selector-trigger-icon" aria-hidden="true">
                {isOpen ? "-" : "+"}
              </span>
            </button>
            {isOpen ? (
              <div className="filter-selector-popover">
                {selectorContent}
              </div>
            ) : null}
          </>
        ) : (
          selectorContent
        )}
      </div>
    </fieldset>
  );
}
