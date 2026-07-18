import { useEffect, useRef, useState } from "react";
import InventoryFilters from "./components/InventoryFilters";
import OpenlaneLogo from "./components/OpenlaneLogo";
import InventoryResults from "./components/InventoryResults";
import {
  DEFAULT_FILTERS,
  FILTER_GROUPS,
  SEARCH_BATCH_SIZE,
  buildSearchCriteria,
} from "./inventoryConfig";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const defaultCriteriaKey = JSON.stringify(buildSearchCriteria(DEFAULT_FILTERS));

function mergeVehicles(existingVehicles, nextVehicles) {
  const seenIds = new Set(existingVehicles.map((vehicle) => vehicle.id));
  const mergedVehicles = [...existingVehicles];

  for (const vehicle of nextVehicles) {
    if (seenIds.has(vehicle.id)) {
      continue;
    }

    seenIds.add(vehicle.id);
    mergedVehicles.push(vehicle);
  }

  return mergedVehicles;
}

export default function App() {
  const [filterSchema, setFilterSchema] = useState(null);
  const [filterMetadata, setFilterMetadata] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [vehicles, setVehicles] = useState([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debouncedCriteriaKey, setDebouncedCriteriaKey] =
    useState(defaultCriteriaKey);

  const requestControllerRef = useRef(null);
  const activeCriteriaKeyRef = useRef(defaultCriteriaKey);
  const resultsSentinelRef = useRef(null);
  const isInitialLoadingRef = useRef(false);
  const isLoadingMoreRef = useRef(false);

  const criteria = buildSearchCriteria(filters);
  const criteriaKey = JSON.stringify(criteria);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrapInventoryPage() {
      try {
        setIsBootstrapping(true);
        setErrorMessage("");

        const [schemaResponse, metadataResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/vehicles/filters/schema`, {
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/api/vehicles/filters/metadata`, {
            signal: controller.signal,
          }),
        ]);

        if (!schemaResponse.ok || !metadataResponse.ok) {
          throw new Error("Unable to load inventory filters.");
        }

        const [schemaPayload, metadataPayload] = await Promise.all([
          schemaResponse.json(),
          metadataResponse.json(),
        ]);

        setFilterSchema(schemaPayload);
        setFilterMetadata(metadataPayload);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage("We couldn't load inventory right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrapInventoryPage();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedCriteriaKey(criteriaKey);
    }, 275);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [criteriaKey]);

  useEffect(() => {
    if (!filterSchema || !filterMetadata) {
      return undefined;
    }

    const parsedCriteria = JSON.parse(debouncedCriteriaKey);
    activeCriteriaKeyRef.current = debouncedCriteriaKey;
    setHasMore(true);
    setVehicles([]);
    setTotalVehicles(0);
    setFiltersOpen(false);

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    async function loadInitialResults() {
      try {
        setIsInitialLoading(true);
        isInitialLoadingRef.current = true;
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        setErrorMessage("");

        const response = await fetch(`${API_BASE_URL}/api/vehicles/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            limit: SEARCH_BATCH_SIZE,
            offset: 0,
            criteria: parsedCriteria,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to load inventory.");
        }

        const payload = await response.json();

        if (activeCriteriaKeyRef.current !== debouncedCriteriaKey) {
          return;
        }

        setVehicles(payload.vehicles);
        setTotalVehicles(payload.total);
        setHasMore(payload.offset + payload.count < payload.total);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage("We couldn't load inventory right now.");
          setHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsInitialLoading(false);
          isInitialLoadingRef.current = false;
        }
      }
    }

    loadInitialResults();

    return () => {
      controller.abort();
    };
  }, [debouncedCriteriaKey, filterMetadata, filterSchema]);

  useEffect(() => {
    if (!resultsSentinelRef.current || !hasMore || isInitialLoading || isLoadingMore) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (!entry?.isIntersecting) {
          return;
        }

        requestMoreVehicles();
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(resultsSentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isInitialLoading, isLoadingMore, vehicles.length]);

  async function requestMoreVehicles() {
    if (
      isBootstrapping ||
      isInitialLoadingRef.current ||
      isLoadingMoreRef.current ||
      !hasMore ||
      !filterSchema ||
      !filterMetadata
    ) {
      return;
    }

    const nextOffset = vehicles.length;
    const currentCriteriaKey = activeCriteriaKeyRef.current;
    const currentCriteria = JSON.parse(currentCriteriaKey);

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      setIsLoadingMore(true);
      isLoadingMoreRef.current = true;
      setErrorMessage("");

      const response = await fetch(`${API_BASE_URL}/api/vehicles/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          limit: SEARCH_BATCH_SIZE,
          offset: nextOffset,
          criteria: currentCriteria,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to load more inventory.");
      }

      const payload = await response.json();

      if (activeCriteriaKeyRef.current !== currentCriteriaKey) {
        return;
      }

      setVehicles((currentVehicles) =>
        mergeVehicles(currentVehicles, payload.vehicles),
      );
      setTotalVehicles(payload.total);
      setHasMore(payload.offset + payload.count < payload.total);
    } catch (error) {
      if (error.name !== "AbortError") {
        setErrorMessage("We couldn't load inventory right now.");
        setHasMore(false);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
      }
    }
  }

  function updateTextFilter(field, value) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      text: {
        ...currentFilters.text,
        [field]: value,
      },
    }));
  }

  function toggleCategoricalFilter(field, value) {
    setFilters((currentFilters) => {
      const currentValues = currentFilters.categorical[field];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((option) => option !== value)
        : [...currentValues, value];

      return {
        ...currentFilters,
        categorical: {
          ...currentFilters.categorical,
          [field]: nextValues,
        },
      };
    });
  }

  function updateRangeFilter(field, boundary, value) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      range: {
        ...currentFilters.range,
        [field]: {
          ...currentFilters.range[field],
          [boundary]: value,
        },
      },
    }));
  }

  function updateDateFilter(boundary, value) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      datetime: {
        ...currentFilters.datetime,
        auction_start: {
          ...currentFilters.datetime.auction_start,
          [boundary]: value,
        },
      },
    }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  const allowedFields = new Set(
    filterSchema
      ? [
          ...filterSchema.fields.text,
          ...filterSchema.fields.numeric,
          ...filterSchema.fields.datetime,
        ]
      : [],
  );

  return (
    <main className="inventory-page">
      <section className="inventory-hero">
        <div className="inventory-brand-lockup" aria-label="OPENLANE">
          <OpenlaneLogo />
        </div>
        <p className="inventory-hero-copy">
          <strong>Wholesale made easy</strong>
        </p>
      </section>

      <div className="inventory-mobile-actions">
        <button
          className="inventory-filter-toggle"
          type="button"
          onClick={() => setFiltersOpen(true)}
        >
          Filters
        </button>
        <p className="inventory-mobile-count">
          {totalVehicles > 0 ? `${totalVehicles} matches` : "Inventory search"}
        </p>
      </div>

      <section className="inventory-layout">
        <InventoryFilters
          allowedFields={allowedFields}
          filterGroups={FILTER_GROUPS}
          filterMetadata={filterMetadata}
          filters={filters}
          isBootstrapping={isBootstrapping}
          isOpen={filtersOpen}
          onClearFilters={clearFilters}
          onClose={() => setFiltersOpen(false)}
          onDateChange={updateDateFilter}
          onRangeChange={updateRangeFilter}
          onTextChange={updateTextFilter}
          onToggleCategorical={toggleCategoricalFilter}
        />

        <InventoryResults
          errorMessage={errorMessage}
          hasMore={hasMore}
          isBootstrapping={isBootstrapping}
          isInitialLoading={isInitialLoading}
          isLoadingMore={isLoadingMore}
          resultsSentinelRef={resultsSentinelRef}
          totalVehicles={totalVehicles}
          vehicles={vehicles}
        />
      </section>
    </main>
  );
}
