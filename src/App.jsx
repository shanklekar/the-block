import { useEffect, useRef, useState } from "react";
import BuyNowConfirmationModal from "./components/BuyNowConfirmationModal";
import InventorySection from "./components/InventorySection";
import OpenlaneLogo from "./components/OpenlaneLogo";
import VehicleDetailsModal from "./components/VehicleDetailsModal";
import VehicleImageLightbox from "./components/VehicleImageLightbox";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
const CURRENT_USER_ID = 1;
const WATCH_MUTATION_ENDPOINT = `${API_BASE_URL}/api/users/${CURRENT_USER_ID}/watching`;

export default function App() {
  const [filterSchema, setFilterSchema] = useState(null);
  const [filterMetadata, setFilterMetadata] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState("");
  const [watchlistRefreshToken, setWatchlistRefreshToken] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isVehicleDetailsLoading, setIsVehicleDetailsLoading] = useState(false);
  const [vehicleDetailsErrorMessage, setVehicleDetailsErrorMessage] = useState("");
  const [vehicleDetailsWatchErrorMessage, setVehicleDetailsWatchErrorMessage] = useState("");
  const [isVehicleDetailsWatchPending, setIsVehicleDetailsWatchPending] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [buyNowVehicle, setBuyNowVehicle] = useState(null);
  const [purchasedVehicleIds, setPurchasedVehicleIds] = useState({});

  const vehicleDetailsRequestRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrapInventoryPage() {
      try {
        setIsBootstrapping(true);
        setBootstrapErrorMessage("");

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
          setBootstrapErrorMessage("We couldn't load inventory right now.");
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
    if (!selectedVehicleId) {
      setSelectedVehicle(null);
      setIsVehicleDetailsLoading(false);
      setVehicleDetailsErrorMessage("");
      setVehicleDetailsWatchErrorMessage("");
      setIsVehicleDetailsWatchPending(false);
      vehicleDetailsRequestRef.current?.abort();
      return undefined;
    }

    vehicleDetailsRequestRef.current?.abort();
    const controller = new AbortController();
    vehicleDetailsRequestRef.current = controller;

    async function loadVehicleDetails() {
      try {
        setIsVehicleDetailsLoading(true);
        setVehicleDetailsErrorMessage("");
        setVehicleDetailsWatchErrorMessage("");
        setSelectedVehicle(null);

        const response = await fetch(
          `${API_BASE_URL}/api/vehicles/${selectedVehicleId}?user_id=${CURRENT_USER_ID}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error("Unable to load vehicle details.");
        }

        const payload = await response.json();
        setSelectedVehicle(payload);
      } catch (error) {
        if (error.name !== "AbortError") {
          setVehicleDetailsErrorMessage("We couldn't load this vehicle right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsVehicleDetailsLoading(false);
        }
      }
    }

    loadVehicleDetails();

    return () => {
      controller.abort();
    };
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicleId && !selectedImageUrl && !buyNowVehicle) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }

      if (selectedImageUrl) {
        setSelectedImageUrl("");
        return;
      }

      if (buyNowVehicle) {
        setBuyNowVehicle(null);
        return;
      }

      setSelectedVehicleId("");
      setSelectedVehicle(null);
      setVehicleDetailsErrorMessage("");
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [buyNowVehicle, selectedImageUrl, selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicleId && !selectedImageUrl && !buyNowVehicle) {
      return undefined;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [buyNowVehicle, selectedImageUrl, selectedVehicleId]);

  function openVehicleDetails(vehicleId) {
    setSelectedImageUrl("");
    setSelectedVehicleId(vehicleId);
  }

  function closeVehicleDetails() {
    vehicleDetailsRequestRef.current?.abort();
    setSelectedImageUrl("");
    setSelectedVehicleId("");
    setSelectedVehicle(null);
    setIsVehicleDetailsLoading(false);
    setVehicleDetailsErrorMessage("");
    setVehicleDetailsWatchErrorMessage("");
    setIsVehicleDetailsWatchPending(false);
  }

  function handleRequestBuyNow(vehicle) {
    if (!vehicle || Number(vehicle.buy_now_price) <= 0 || purchasedVehicleIds[vehicle.id]) {
      return;
    }

    setBuyNowVehicle(vehicle);
  }

  function handleConfirmBuyNow() {
    if (!buyNowVehicle) {
      return;
    }

    setPurchasedVehicleIds((currentIds) => ({
      ...currentIds,
      [buyNowVehicle.id]: true,
    }));
    setBuyNowVehicle(null);
  }

  function handleWatchStateChanged({ isWatched, vehicleId } = {}) {
    if (vehicleId && selectedVehicle?.id === vehicleId) {
      setSelectedVehicle((currentVehicle) =>
        currentVehicle
          ? { ...currentVehicle, is_watched: isWatched }
          : currentVehicle,
      );
    }
    setWatchlistRefreshToken((currentValue) => currentValue + 1);
  }

  async function handleVehicleDetailsWatchToggle() {
    if (!selectedVehicle) {
      return;
    }

    setVehicleDetailsWatchErrorMessage("");
    setIsVehicleDetailsWatchPending(true);

    try {
      const response = await fetch(WATCH_MUTATION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicle_id: selectedVehicle.id,
          watch: !selectedVehicle.is_watched,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update watchlist.");
      }

      const payload = await response.json();

      setSelectedVehicle((currentVehicle) =>
        currentVehicle
          ? { ...currentVehicle, is_watched: payload.is_watched }
          : currentVehicle,
      );
      handleWatchStateChanged({
        isWatched: payload.is_watched,
        vehicleId: payload.vehicle_id,
      });
    } catch {
      setVehicleDetailsWatchErrorMessage("We couldn't update that watchlist item.");
    } finally {
      setIsVehicleDetailsWatchPending(false);
    }
  }

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

      <section className="inventory-layout inventory-section-stack">
        <InventorySection
          bootstrapErrorMessage={bootstrapErrorMessage}
          currentUserId={CURRENT_USER_ID}
          emptyStateMessage="No watched vehicles match your criteria."
          enableWatchToggle
          filterMetadata={filterMetadata}
          filterPanelId="watchlist-filters-panel"
          filterSchema={filterSchema}
          filtersPanelLabel="Watchlist filters"
          filtersTitle="Refine watchlist"
          isBootstrapping={isBootstrapping}
          onRequestBuyNow={handleRequestBuyNow}
          onWatchStateChanged={handleWatchStateChanged}
          onSelectVehicle={openVehicleDetails}
          panelLabel="Watchlist"
          purchasedVehicleIds={purchasedVehicleIds}
          refreshToken={watchlistRefreshToken}
          searchEndpoint={`${API_BASE_URL}/api/users/1/watching/vehicles/search`}
          watchMutationEndpoint={WATCH_MUTATION_ENDPOINT}
          sectionTitle={(totalVehicles) =>
            totalVehicles > 0
              ? `${totalVehicles.toLocaleString()} watched vehicles ready to review`
              : "Your watchlist"
          }
          sortLabel="Sort by"
        />

        <InventorySection
          bootstrapErrorMessage={bootstrapErrorMessage}
          currentUserId={CURRENT_USER_ID}
          emptyStateMessage="No vehicles match your criteria."
          enableWatchToggle
          filterMetadata={filterMetadata}
          filterPanelId="inventory-filters-panel"
          filterSchema={filterSchema}
          filtersPanelLabel="Search filters"
          filtersTitle="Refine inventory"
          isBootstrapping={isBootstrapping}
          onRequestBuyNow={handleRequestBuyNow}
          onWatchStateChanged={handleWatchStateChanged}
          onSelectVehicle={openVehicleDetails}
          panelLabel="Live search results"
          purchasedVehicleIds={purchasedVehicleIds}
          refreshToken={watchlistRefreshToken}
          searchEndpoint={`${API_BASE_URL}/api/vehicles/search`}
          watchMutationEndpoint={WATCH_MUTATION_ENDPOINT}
          sectionTitle={(totalVehicles) =>
            totalVehicles > 0
              ? `${totalVehicles.toLocaleString()} vehicles ready to review`
              : "Inventory results"
          }
          sortLabel="Sort by"
        />
      </section>

      {selectedVehicleId ? (
        <VehicleDetailsModal
          errorMessage={vehicleDetailsErrorMessage}
          isPurchased={Boolean(selectedVehicle && purchasedVehicleIds[selectedVehicle.id])}
          isLoading={isVehicleDetailsLoading}
          isWatchPending={isVehicleDetailsWatchPending}
          onBuyNow={handleRequestBuyNow}
          onClose={closeVehicleDetails}
          onOpenImage={setSelectedImageUrl}
          onToggleWatch={handleVehicleDetailsWatchToggle}
          vehicle={selectedVehicle}
          watchErrorMessage={vehicleDetailsWatchErrorMessage}
        />
      ) : null}

      {buyNowVehicle ? (
        <BuyNowConfirmationModal
          onCancel={() => setBuyNowVehicle(null)}
          onConfirm={handleConfirmBuyNow}
          vehicle={buyNowVehicle}
        />
      ) : null}

      {selectedImageUrl ? (
        <VehicleImageLightbox
          imageUrl={selectedImageUrl}
          onClose={() => setSelectedImageUrl("")}
          vehicleTitle={
            selectedVehicle
              ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
              : "Vehicle image"
          }
        />
      ) : null}
    </main>
  );
}
