import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "./inventoryConfig";
import BuyNowConfirmationModal from "./components/BuyNowConfirmationModal";
import InventorySection from "./components/InventorySection";
import OpenlaneLogo from "./components/OpenlaneLogo";
import VehicleDetailsModal from "./components/VehicleDetailsModal";
import VehicleImageLightbox from "./components/VehicleImageLightbox";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
const CURRENT_USER_ID = 1;
const PURCHASE_MUTATION_ENDPOINT = `${API_BASE_URL}/api/users/${CURRENT_USER_ID}/purchased`;
const WATCH_MUTATION_ENDPOINT = `${API_BASE_URL}/api/users/${CURRENT_USER_ID}/watching`;

export default function App() {
  const [filterSchema, setFilterSchema] = useState(null);
  const [filterMetadata, setFilterMetadata] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState("");
  const [inventoryRefreshToken, setInventoryRefreshToken] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isVehicleDetailsLoading, setIsVehicleDetailsLoading] = useState(false);
  const [vehicleDetailsErrorMessage, setVehicleDetailsErrorMessage] = useState("");
  const [vehicleDetailsWatchErrorMessage, setVehicleDetailsWatchErrorMessage] = useState("");
  const [vehicleDetailsPurchaseMessage, setVehicleDetailsPurchaseMessage] = useState("");
  const [isVehicleDetailsWatchPending, setIsVehicleDetailsWatchPending] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [buyNowVehicle, setBuyNowVehicle] = useState(null);
  const [isBuyNowPending, setIsBuyNowPending] = useState(false);
  const [purchaseFeedbackMessage, setPurchaseFeedbackMessage] = useState("");
  const [purchaseFeedbackTone, setPurchaseFeedbackTone] = useState("info");
  const [purchasedVehicleIds, setPurchasedVehicleIds] = useState({});
  const [soldVehicleIds, setSoldVehicleIds] = useState({});

  const vehicleDetailsRequestRef = useRef(null);

  async function fetchVehicleDetails(vehicleId, signal) {
    const response = await fetch(
      `${API_BASE_URL}/api/vehicles/${vehicleId}?user_id=${CURRENT_USER_ID}`,
      {
        signal,
      },
    );

    if (!response.ok) {
      throw new Error("Unable to load vehicle details.");
    }

    return response.json();
  }

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
      setVehicleDetailsPurchaseMessage("");
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
        setVehicleDetailsPurchaseMessage("");
        setSelectedVehicle(null);
        const payload = await fetchVehicleDetails(selectedVehicleId, controller.signal);
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
    setVehicleDetailsPurchaseMessage("");
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
    setVehicleDetailsPurchaseMessage("");
    setIsVehicleDetailsWatchPending(false);
  }

  function handleRequestBuyNow(vehicle) {
    if (
      !vehicle ||
      vehicle.is_purchased ||
      Number(vehicle.buy_now_price) <= 0 ||
      purchasedVehicleIds[vehicle.id] ||
      soldVehicleIds[vehicle.id]
    ) {
      return;
    }

    setPurchaseFeedbackMessage("");
    setVehicleDetailsPurchaseMessage("");
    setBuyNowVehicle(vehicle);
  }

  async function handleConfirmBuyNow() {
    if (!buyNowVehicle || isBuyNowPending) {
      return;
    }

    const vehicleId = buyNowVehicle.id;
    setIsBuyNowPending(true);
    setPurchaseFeedbackMessage("");
    setVehicleDetailsPurchaseMessage("");

    try {
      const response = await fetch(PURCHASE_MUTATION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          buy_now_price: buyNowVehicle.buy_now_price,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok) {
        setPurchasedVehicleIds((currentIds) => ({
          ...currentIds,
          [vehicleId]: true,
        }));
        if (selectedVehicle?.id === vehicleId) {
          setSelectedVehicle((currentVehicle) =>
            currentVehicle
              ? {
                  ...currentVehicle,
                  is_purchased: true,
                  is_purchased_by_user: true,
                  is_watched: true,
                }
              : currentVehicle,
          );
        }
        setInventoryRefreshToken((currentValue) => currentValue + 1);
        setBuyNowVehicle(null);
        return;
      }

      if (response.status === 409 && payload.detail === "Buy now price does not match") {
        let latestVehicle = null;

        try {
          latestVehicle = await fetchVehicleDetails(vehicleId);
        } catch {
          latestVehicle = null;
        }

        if (latestVehicle && selectedVehicle?.id === vehicleId) {
          setSelectedVehicle(latestVehicle);
        }

        setInventoryRefreshToken((currentValue) => currentValue + 1);
        setBuyNowVehicle(null);

        const latestPriceMessage =
          latestVehicle && Number(latestVehicle.buy_now_price) > 0
            ? `The buy now price changed to ${formatCurrency(
                latestVehicle.buy_now_price,
              )}. You can try again.`
            : "The buy now value changed and is no longer available for instant purchase.";

        setPurchaseFeedbackTone("info");
        setPurchaseFeedbackMessage(latestPriceMessage);
        if (selectedVehicle?.id === vehicleId) {
          setVehicleDetailsPurchaseMessage(latestPriceMessage);
        }
        return;
      }

      if (
        response.status === 409 &&
        payload.detail === "Vehicle has already been purchased by another user"
      ) {
        setSoldVehicleIds((currentIds) => ({
          ...currentIds,
          [vehicleId]: true,
        }));
        setInventoryRefreshToken((currentValue) => currentValue + 1);
        setBuyNowVehicle(null);
        if (selectedVehicle?.id === vehicleId) {
          closeVehicleDetails();
        }
        setPurchaseFeedbackTone("error");
        setPurchaseFeedbackMessage("Sorry, this vehicle has already been sold.");
        return;
      }

      throw new Error(payload.detail ?? "Unable to complete purchase.");
    } catch {
      setPurchaseFeedbackTone("error");
      setPurchaseFeedbackMessage("We couldn't complete that purchase right now.");
    } finally {
      setIsBuyNowPending(false);
    }
  }

  function handleWatchStateChanged({ isWatched, vehicleId } = {}) {
    if (vehicleId && selectedVehicle?.id === vehicleId) {
      setSelectedVehicle((currentVehicle) =>
        currentVehicle
          ? { ...currentVehicle, is_watched: isWatched }
          : currentVehicle,
      );
    }
    setInventoryRefreshToken((currentValue) => currentValue + 1);
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

  function handleBidPlaced(payload) {
    const successMessage = `Bid placed at ${formatCurrency(payload.current_bid)}.`;
    setPurchaseFeedbackTone("info");
    setPurchaseFeedbackMessage(successMessage);

    if (selectedVehicle?.id === payload.vehicle_id) {
      setVehicleDetailsPurchaseMessage(successMessage);
      setSelectedVehicle((currentVehicle) =>
        currentVehicle
          ? {
              ...currentVehicle,
              bid_count: payload.bid_count,
              current_bid: payload.current_bid,
            }
          : currentVehicle,
      );
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
        {purchaseFeedbackMessage ? (
          <div
            className={
              purchaseFeedbackTone === "error"
                ? "inventory-feedback error"
                : "inventory-inline-message"
            }
            role="status"
          >
            {purchaseFeedbackMessage}
          </div>
        ) : null}

        <InventorySection
          apiBaseUrl={API_BASE_URL}
          bootstrapErrorMessage={bootstrapErrorMessage}
          currentUserId={CURRENT_USER_ID}
          emptyStateMessage="No watched vehicles match your criteria."
          enableWatchToggle
          filterMetadata={filterMetadata}
          filterPanelId="watchlist-filters-panel"
          filterSchema={filterSchema}
          filtersPanelLabel="Watchlist filters"
          filtersTitle="Refine watchlist"
          hiddenVehicleIds={soldVehicleIds}
          isBootstrapping={isBootstrapping}
          keepPurchasedLast
          onBidPlaced={handleBidPlaced}
          onRequestBuyNow={handleRequestBuyNow}
          onWatchStateChanged={handleWatchStateChanged}
          onSelectVehicle={openVehicleDetails}
          panelLabel="Watchlist"
          purchasedVehicleIds={purchasedVehicleIds}
          refreshToken={inventoryRefreshToken}
          searchEndpoint={`${API_BASE_URL}/api/users/1/watching/vehicles/search`}
          showInlineBidding
          watchMutationEndpoint={WATCH_MUTATION_ENDPOINT}
          sectionTitle={(totalVehicles) =>
            totalVehicles > 0
              ? `${totalVehicles.toLocaleString()} watched vehicles ready to review`
              : "Your watchlist"
          }
          sortLabel="Sort by"
        />

        <InventorySection
          apiBaseUrl={API_BASE_URL}
          bootstrapErrorMessage={bootstrapErrorMessage}
          currentUserId={CURRENT_USER_ID}
          emptyStateMessage="No vehicles match your criteria."
          enableWatchToggle
          filterMetadata={filterMetadata}
          filterPanelId="inventory-filters-panel"
          filterSchema={filterSchema}
          filtersPanelLabel="Search filters"
          filtersTitle="Refine inventory"
          hiddenVehicleIds={soldVehicleIds}
          isBootstrapping={isBootstrapping}
          onBidPlaced={handleBidPlaced}
          onRequestBuyNow={handleRequestBuyNow}
          onWatchStateChanged={handleWatchStateChanged}
          onSelectVehicle={openVehicleDetails}
          panelLabel="Live search results"
          purchasedVehicleIds={purchasedVehicleIds}
          refreshToken={inventoryRefreshToken}
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
          apiBaseUrl={API_BASE_URL}
          currentUserId={CURRENT_USER_ID}
          errorMessage={vehicleDetailsErrorMessage}
          isPurchased={Boolean(
            selectedVehicle &&
              (selectedVehicle.is_purchased_by_user ||
                purchasedVehicleIds[selectedVehicle.id]),
          )}
          isLoading={isVehicleDetailsLoading}
          purchaseMessage={vehicleDetailsPurchaseMessage}
          isWatchPending={isVehicleDetailsWatchPending}
          onBidPlaced={handleBidPlaced}
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
          isSubmitting={isBuyNowPending}
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
