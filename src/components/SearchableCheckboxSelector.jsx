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

  return `${selectedValues.length} selected`;
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
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(buildFallbackOptions(fallbackOptions));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const rootRef = useRef(null);
  const selectorMode = field.selectorMode ?? "inline";
  const criteriaKey = JSON.stringify(criteria);
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const shouldShowInlineOptions = selectorMode === "inline" && (isFocused || hasQuery);
  const shouldFetchOptions =
    (selectorMode === "inline" && (isFocused || hasQuery)) ||
    (selectorMode === "dropdown" && isOpen);
  const normalizedFallbackOptions = buildFallbackOptions(fallbackOptions);

  useEffect(() => {
    setOptions(buildFallbackOptions(fallbackOptions));
  }, [fallbackOptions]);

  useEffect(() => {
    const shouldWatchOutsideClicks =
      (selectorMode === "dropdown" && isOpen) ||
      (selectorMode === "inline" && (isFocused || hasQuery));

    if (!shouldWatchOutsideClicks) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
        setIsFocused(false);
        setQuery("");
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsFocused(false);
        setQuery("");
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasQuery, isFocused, isOpen, selectorMode]);

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
  const locallyFilteredFallbackOptions = normalizedFallbackOptions.filter((option) => {
    if (!normalizedQuery) {
      return true;
    }

    return option.label.toLowerCase().includes(normalizedQuery);
  });
  const baseOptions =
    shouldShowInlineOptions || selectorMode === "dropdown"
      ? (optionsEndpoint ? options : locallyFilteredFallbackOptions)
      : [];

  for (const option of baseOptions) {
    optionMap.set(option.value, option);
  }

  for (const selectedValue of selectedValues) {
    if (!optionMap.has(selectedValue)) {
      const fallbackOption = normalizedFallbackOptions.find(
        (option) => option.value === selectedValue,
      );
      optionMap.set(selectedValue, {
        value: selectedValue,
        label: fallbackOption?.label ?? selectedValue,
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
        onFocus={() => {
          if (selectorMode === "inline") {
            setIsFocused(true);
          }
        }}
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
        {!hasQuery && !shouldShowInlineOptions && selectedValues.length ? (
          <p className="filter-option-empty">Start typing to add more options.</p>
        ) : null}
        {(hasQuery || shouldShowInlineOptions) && !isLoading && !mergedOptions.length ? (
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
              onClick={() => {
                setIsOpen((currentOpen) => {
                  const nextOpen = !currentOpen;

                  if (!nextOpen) {
                    setQuery("");
                  }

                  return nextOpen;
                });
              }}
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
            {selectedValues.length ? (
              <div className="filter-selected-list" aria-label={`Selected ${field.label.toLowerCase()}`}>
                {selectedValues.map((selectedValue) => (
                  <button
                    className="filter-selected-pill"
                    key={selectedValue}
                    type="button"
                    onClick={() => onToggle(field.name, selectedValue)}
                  >
                    <span>{optionMap.get(selectedValue)?.label ?? selectedValue}</span>
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
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
