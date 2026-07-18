import { useEffect, useRef, useState } from "react";
import {
  createDefaultFilters,
  DEFAULT_SORT_OPTION_ID,
  FILTER_GROUPS,
  SEARCH_BATCH_SIZE,
  SORT_OPTIONS,
  buildSearchCriteria,
} from "../inventoryConfig";
import InventoryFilters from "./InventoryFilters";
import InventoryResults from "./InventoryResults";

const defaultCriteriaKey = JSON.stringify(buildSearchCriteria(createDefaultFilters()));

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

function countActiveFilters(filters) {
  const activeTextFilters = Object.values(filters.text).filter((value) =>
    value.trim(),
  ).length;
  const activeCategoricalFilters = Object.values(filters.categorical).reduce(
    (total, values) => total + values.length,
    0,
  );
  const activeRangeFilters = Object.values(filters.range).reduce(
    (total, range) => total + (range.min !== "" ? 1 : 0) + (range.max !== "" ? 1 : 0),
    0,
  );
  const activeDateFilters = Object.values(filters.datetime).reduce(
    (total, range) => total + (range.min !== "" ? 1 : 0) + (range.max !== "" ? 1 : 0),
    0,
  );

  return (
    activeTextFilters +
    activeCategoricalFilters +
    activeRangeFilters +
    activeDateFilters
  );
}

function filterHiddenVehicles(vehicles, hiddenVehicleIds) {
  return vehicles.filter((vehicle) => !hiddenVehicleIds[vehicle.id]);
}

export default function InventorySection({
  bootstrapErrorMessage,
  currentUserId = null,
  enableWatchToggle = false,
  filterMetadata,
  filterSchema,
  filterPanelId,
  filtersPanelLabel,
  filtersTitle,
  isBootstrapping,
  onRequestBuyNow,
  onWatchStateChanged,
  onSelectVehicle,
  panelLabel,
  purchasedVehicleIds = {},
  refreshToken = 0,
  searchEndpoint,
  sectionTitle,
  sortLabel,
  emptyStateMessage,
  hiddenVehicleIds = {},
  watchMutationEndpoint = "",
}) {
  const [filters, setFilters] = useState(createDefaultFilters);
  const [vehicles, setVehicles] = useState([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [watchMutationErrorMessage, setWatchMutationErrorMessage] = useState("");
  const [pendingWatchVehicleIds, setPendingWatchVehicleIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debouncedCriteriaKey, setDebouncedCriteriaKey] =
    useState(defaultCriteriaKey);
  const [sortOptionId, setSortOptionId] = useState(DEFAULT_SORT_OPTION_ID);

  const requestControllerRef = useRef(null);
  const activeCriteriaKeyRef = useRef(defaultCriteriaKey);
  const activeSortRef = useRef({
    sortBy: SORT_OPTIONS[0].sortBy,
    sortDirection: SORT_OPTIONS[0].sortDirection,
  });
  const resultsSentinelRef = useRef(null);
  const isInitialLoadingRef = useRef(false);
  const isLoadingMoreRef = useRef(false);

  const criteria = buildSearchCriteria(filters);
  const criteriaKey = JSON.stringify(criteria);
  const selectedSortOption =
    SORT_OPTIONS.find((option) => option.id === sortOptionId) ?? SORT_OPTIONS[0];
  const activeFilterCount = countActiveFilters(filters);
  const allowedFields = new Set(
    filterSchema
      ? [
          ...filterSchema.fields.text,
          ...filterSchema.fields.numeric,
          ...filterSchema.fields.datetime,
        ]
      : [],
  );
  const displayErrorMessage = errorMessage || bootstrapErrorMessage;
  const shouldIncludeWatchState = enableWatchToggle && currentUserId !== null;
  const hiddenVehicleIdsKey = JSON.stringify(Object.keys(hiddenVehicleIds).sort());

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedCriteriaKey(criteriaKey);
    }, 275);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [criteriaKey]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!Object.keys(hiddenVehicleIds).length) {
      return;
    }

    setVehicles((currentVehicles) => filterHiddenVehicles(currentVehicles, hiddenVehicleIds));
  }, [hiddenVehicleIds, hiddenVehicleIdsKey]);

  function buildSearchPayload({ criteria, limit, offset, sortDirection, sortBy }) {
    return {
      limit,
      offset,
      criteria,
      sort_by: sortBy,
      sort_direction: sortDirection,
      ...(shouldIncludeWatchState ? { user_id: currentUserId } : {}),
    };
  }

  useEffect(() => {
    if (!filterSchema || !filterMetadata) {
      return undefined;
    }

    const parsedCriteria = JSON.parse(debouncedCriteriaKey);
    activeCriteriaKeyRef.current = debouncedCriteriaKey;
    activeSortRef.current = {
      sortBy: selectedSortOption.sortBy,
      sortDirection: selectedSortOption.sortDirection,
    };
    setHasMore(true);
    setVehicles([]);
    setTotalVehicles(0);

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

        const response = await fetch(searchEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify(
            buildSearchPayload({
              criteria: parsedCriteria,
              limit: SEARCH_BATCH_SIZE,
              offset: 0,
              sortBy: selectedSortOption.sortBy,
              sortDirection: selectedSortOption.sortDirection,
            }),
          ),
        });

        if (!response.ok) {
          throw new Error("Unable to load inventory.");
        }

        const payload = await response.json();

        if (activeCriteriaKeyRef.current !== debouncedCriteriaKey) {
          return;
        }

        setVehicles(filterHiddenVehicles(payload.vehicles, hiddenVehicleIds));
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
  }, [
    currentUserId,
    debouncedCriteriaKey,
    filterMetadata,
    filterSchema,
    refreshToken,
    searchEndpoint,
    selectedSortOption,
    shouldIncludeWatchState,
    hiddenVehicleIds,
    hiddenVehicleIdsKey,
  ]);

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
    const currentSort = activeSortRef.current;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      setIsLoadingMore(true);
      isLoadingMoreRef.current = true;
      setErrorMessage("");

      const response = await fetch(searchEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(
          buildSearchPayload({
            criteria: currentCriteria,
            limit: SEARCH_BATCH_SIZE,
            offset: nextOffset,
            sortBy: currentSort.sortBy,
            sortDirection: currentSort.sortDirection,
          }),
        ),
      });

      if (!response.ok) {
        throw new Error("Unable to load more inventory.");
      }

      const payload = await response.json();

      if (activeCriteriaKeyRef.current !== currentCriteriaKey) {
        return;
      }

      setVehicles((currentVehicles) =>
        mergeVehicles(
          currentVehicles,
          filterHiddenVehicles(payload.vehicles, hiddenVehicleIds),
        ),
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

  async function handleToggleWatch(vehicleId, nextWatchState) {
    if (!enableWatchToggle || currentUserId === null || !watchMutationEndpoint) {
      return;
    }

    setWatchMutationErrorMessage("");
    setPendingWatchVehicleIds((currentIds) => [...currentIds, vehicleId]);

    try {
      const response = await fetch(watchMutationEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          watch: nextWatchState,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update watchlist.");
      }

      const payload = await response.json();

      setVehicles((currentVehicles) =>
        currentVehicles.map((vehicle) =>
          vehicle.id === vehicleId
            ? { ...vehicle, is_watched: payload.is_watched }
            : vehicle,
        ),
      );
      onWatchStateChanged?.({
        isWatched: payload.is_watched,
        userId: currentUserId,
        vehicleId,
      });
    } catch {
      setWatchMutationErrorMessage("We couldn't update that watchlist item.");
    } finally {
      setPendingWatchVehicleIds((currentIds) =>
        currentIds.filter((currentId) => currentId !== vehicleId),
      );
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
    setFilters(createDefaultFilters());
  }

  return (
    <InventoryResults
      activeFilterCount={activeFilterCount}
      emptyStateMessage={emptyStateMessage}
      errorMessage={displayErrorMessage}
      filterPanelId={filterPanelId}
      filtersOpen={filtersOpen}
      filtersPanel={
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
          panelId={filterPanelId}
          panelLabel={filtersPanelLabel}
          title={filtersTitle}
        />
      }
      hasMore={hasMore}
      isBootstrapping={isBootstrapping}
      isInitialLoading={isInitialLoading}
      isLoadingMore={isLoadingMore}
      onRequestBuyNow={onRequestBuyNow}
      onSelectVehicle={onSelectVehicle}
      onSortChange={setSortOptionId}
      onToggleWatch={handleToggleWatch}
      onToggleFilters={() => setFiltersOpen((currentOpen) => !currentOpen)}
      panelLabel={panelLabel}
      purchasedVehicleIds={purchasedVehicleIds}
      pendingWatchVehicleIds={pendingWatchVehicleIds}
      resultsSentinelRef={resultsSentinelRef}
      sortLabel={sortLabel}
      sortOptionId={sortOptionId}
      title={sectionTitle(totalVehicles)}
      totalVehicles={totalVehicles}
      vehicles={vehicles}
      watchMutationErrorMessage={watchMutationErrorMessage}
      watchToggleEnabled={enableWatchToggle}
    />
  );
}
