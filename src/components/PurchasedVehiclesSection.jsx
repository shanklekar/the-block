import { useEffect, useRef, useState } from "react";
import { formatCurrency, formatPurchaseDate } from "../inventoryConfig";

const PURCHASED_SORT_OPTIONS = [
  {
    id: "purchase_date_desc",
    label: "Purchase date: Newest first",
    sortBy: "purchase_date",
    sortDirection: "desc",
  },
  {
    id: "purchase_date_asc",
    label: "Purchase date: Oldest first",
    sortBy: "purchase_date",
    sortDirection: "asc",
  },
  {
    id: "purchase_amount_desc",
    label: "Purchase amount: High to low",
    sortBy: "purchase_amount",
    sortDirection: "desc",
  },
  {
    id: "purchase_amount_asc",
    label: "Purchase amount: Low to high",
    sortBy: "purchase_amount",
    sortDirection: "asc",
  },
];

const DEFAULT_PURCHASED_SORT_OPTION_ID = PURCHASED_SORT_OPTIONS[0].id;
const PURCHASED_SEARCH_BATCH_SIZE = 100;

function getVehicleTitle(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

function getVehicleContext(vehicle) {
  return [
    vehicle.body_style,
    vehicle.exterior_color,
    vehicle.city,
    vehicle.province,
    vehicle.selling_dealership,
  ]
    .filter(Boolean)
    .join(" • ");
}

export default function PurchasedVehiclesSection({
  apiBaseUrl = "",
  currentUserId,
  onSelectVehicle,
  refreshToken = 0,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortOptionId, setSortOptionId] = useState(DEFAULT_PURCHASED_SORT_OPTION_ID);
  const [vehicles, setVehicles] = useState([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const requestControllerRef = useRef(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 275);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchTerm]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (currentUserId === null || currentUserId === undefined) {
      setVehicles([]);
      setTotalVehicles(0);
      setErrorMessage("");
      setIsLoading(false);
      return undefined;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    async function loadPurchasedVehicles() {
      const selectedSortOption =
        PURCHASED_SORT_OPTIONS.find((option) => option.id === sortOptionId) ??
        PURCHASED_SORT_OPTIONS[0];

      try {
        setIsLoading(true);
        setErrorMessage("");

        let collectedVehicles = [];
        let offset = 0;
        let total = 0;

        while (true) {
          const response = await fetch(
            `${apiBaseUrl}/api/users/${currentUserId}/purchased/vehicles/search`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              signal: controller.signal,
              body: JSON.stringify({
                limit: PURCHASED_SEARCH_BATCH_SIZE,
                offset,
                search: debouncedSearchTerm,
                sort_by: selectedSortOption.sortBy,
                sort_direction: selectedSortOption.sortDirection,
              }),
            },
          );

          if (!response.ok) {
            throw new Error("Unable to load purchased vehicles.");
          }

          const payload = await response.json();
          collectedVehicles = [...collectedVehicles, ...payload.vehicles];
          total = payload.total;

          if (
            payload.count === 0 ||
            collectedVehicles.length >= payload.total ||
            payload.count < PURCHASED_SEARCH_BATCH_SIZE
          ) {
            break;
          }

          offset += payload.count;
        }

        if (!controller.signal.aborted) {
          setVehicles(collectedVehicles);
          setTotalVehicles(total);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setVehicles([]);
          setTotalVehicles(0);
          setErrorMessage("We couldn't load purchased vehicles right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadPurchasedVehicles();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, currentUserId, debouncedSearchTerm, refreshToken, sortOptionId]);

  function handleRowKeyDown(event, vehicleId) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectVehicle?.(vehicleId);
  }

  const showEmptyState = !isLoading && !errorMessage && vehicles.length === 0;

  return (
    <section className="inventory-results purchased-vehicles-section">
      <header className="inventory-results-header purchased-vehicles-header">
        <div>
          <p className="inventory-panel-label">Purchased Vehicles</p>
          <h2>
            {totalVehicles > 0
              ? `${totalVehicles.toLocaleString()} vehicles in your purchase history`
              : "Your purchased vehicles"}
          </h2>
        </div>

        <div className="purchased-vehicles-meta">
          <label className="purchased-vehicles-search">
            <span className="inventory-results-sort-label">Search</span>
            <input
              className="purchased-vehicles-search-input"
              placeholder="Search VIN, make, model, trim, condition..."
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <label className="inventory-results-sort">
            <span className="inventory-results-sort-label">Sort by</span>
            <select
              className="inventory-results-sort-select"
              value={sortOptionId}
              onChange={(event) => setSortOptionId(event.target.value)}
            >
              {PURCHASED_SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <span className="inventory-results-pill">
            Showing {vehicles.length.toLocaleString()}
          </span>
          {isLoading ? (
            <span className="inventory-results-pill inventory-results-pill-active">
              Loading purchases...
            </span>
          ) : null}
        </div>
      </header>

      {errorMessage ? <div className="inventory-feedback error">{errorMessage}</div> : null}
      {isLoading && !errorMessage && vehicles.length === 0 ? (
        <div className="inventory-feedback">Loading purchased vehicles...</div>
      ) : null}

      {!errorMessage && vehicles.length > 0 ? (
        <div className="purchased-vehicles-table-wrap">
          <table className="purchased-vehicles-table">
            <thead>
              <tr>
                <th scope="col">Year Make Model Trim</th>
                <th scope="col">VIN</th>
                <th scope="col">Purchase Date</th>
                <th scope="col">Purchase Amount</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => {
                const vehicleTitle = getVehicleTitle(vehicle);
                const vehicleContext = getVehicleContext(vehicle);

                return (
                  <tr
                    aria-label={`Open details for ${vehicleTitle}`}
                    className="purchased-vehicles-row"
                    key={vehicle.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectVehicle?.(vehicle.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, vehicle.id)}
                  >
                    <td>
                      <div className="purchased-vehicles-primary-cell">
                        <strong>{vehicleTitle}</strong>
                        {vehicleContext ? (
                          <span className="purchased-vehicles-context">{vehicleContext}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="purchased-vehicles-vin">{vehicle.vin}</td>
                    <td>{formatPurchaseDate(vehicle.purchase_date)}</td>
                    <td>{formatCurrency(vehicle.purchase_amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {showEmptyState ? (
        <div className="inventory-feedback empty">
          {debouncedSearchTerm
            ? "No purchased vehicles match that search."
            : "You haven't purchased any vehicles yet."}
        </div>
      ) : null}
    </section>
  );
}
