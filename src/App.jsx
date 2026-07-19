import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "./inventoryConfig";
import BuyNowConfirmationModal from "./components/BuyNowConfirmationModal";
import InventorySection from "./components/InventorySection";
import OpenlaneLogo from "./components/OpenlaneLogo";
import PurchasedVehiclesSection from "./components/PurchasedVehiclesSection";
import VehicleDetailsModal from "./components/VehicleDetailsModal";
import VehicleImageLightbox from "./components/VehicleImageLightbox";
import { buildVehicleHistoryPath, readSharedVehicleId } from "./vehicleShare";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
const CURRENT_USER_ID = 1;
const PURCHASE_MUTATION_ENDPOINT = `${API_BASE_URL}/api/users/${CURRENT_USER_ID}/purchased`;
const WATCH_MUTATION_ENDPOINT = `${API_BASE_URL}/api/users/${CURRENT_USER_ID}/watching`;
const SEARCH_VIEW = "search";
const PURCHASED_VIEW = "purchased";
const PURCHASED_VEHICLES_SEGMENT = "purchased_vehicles";
const APP_BASE_PATH = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const WATCHLIST_COLLAPSED_STORAGE_KEY = "block.watchlist.collapsed";

function normalizePathname(pathname = "/") {
  if (!pathname) {
    return "/";
  }

  const normalizedPathname = pathname.replace(/\/+$/, "");
  return normalizedPathname || "/";
}

function buildViewPath(view) {
  if (view === PURCHASED_VIEW) {
    return normalizePathname(`${APP_BASE_PATH}/${PURCHASED_VEHICLES_SEGMENT}`);
  }

  return normalizePathname(APP_BASE_PATH || "/");
}

function readActiveViewFromUrl(location = window.location) {
  const pathname = normalizePathname(location.pathname);

  if (pathname === buildViewPath(PURCHASED_VIEW)) {
    return PURCHASED_VIEW;
  }

  return SEARCH_VIEW;
}

export default function App() {
  const [activeView, setActiveView] = useState(() => readActiveViewFromUrl());
  const [isWatchlistCollapsed, setIsWatchlistCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(WATCHLIST_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [filterSchema, setFilterSchema] = useState(null);
  const [filterMetadata, setFilterMetadata] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState("");
  const [inventoryRefreshToken, setInventoryRefreshToken] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState(() => readSharedVehicleId());
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isVehicleDetailsLoading, setIsVehicleDetailsLoading] = useState(false);
  const [vehicleDetailsErrorMessage, setVehicleDetailsErrorMessage] = useState("");
  const [vehicleDetailsWatchErrorMessage, setVehicleDetailsWatchErrorMessage] = useState("");
  const [vehicleDetailsPurchaseMessage, setVehicleDetailsPurchaseMessage] = useState("");
  const [isVehicleDetailsWatchPending, setIsVehicleDetailsWatchPending] = useState(false);
  const [lightboxState, setLightboxState] = useState(null);
  const [buyNowVehicle, setBuyNowVehicle] = useState(null);
  const [isBuyNowPending, setIsBuyNowPending] = useState(false);
  const [purchaseFeedbackMessage, setPurchaseFeedbackMessage] = useState("");
  const [purchaseFeedbackTone, setPurchaseFeedbackTone] = useState("info");
  const [purchasedVehicleIds, setPurchasedVehicleIds] = useState({});
  const [soldVehicleIds, setSoldVehicleIds] = useState({});

  const vehicleDetailsRequestRef = useRef(null);

  function syncViewUrl(view, { replace = false } = {}) {
    const url = new URL(window.location.href);
    url.pathname = buildViewPath(view);
    const nextPath = `${url.pathname}${url.search}${url.hash}`;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextPath === currentPath) {
      return;
    }

    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", nextPath);
  }

  function syncVehicleUrl(vehicleId = "", { replace = false } = {}) {
    const nextPath = buildVehicleHistoryPath(vehicleId);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextPath === currentPath) {
      return;
    }

    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", nextPath);
  }

  function openView(view, { replace = false } = {}) {
    setActiveView(view);
    syncViewUrl(view, { replace });
  }

  function resetVehicleDetailsState() {
    vehicleDetailsRequestRef.current?.abort();
    setSelectedVehicleId("");
    setSelectedVehicle(null);
    setIsVehicleDetailsLoading(false);
    setVehicleDetailsErrorMessage("");
    setVehicleDetailsWatchErrorMessage("");
    setVehicleDetailsPurchaseMessage("");
    setIsVehicleDetailsWatchPending(false);
  }

  function syncSelectedVehicleFromUrl() {
    const nextVehicleId = readSharedVehicleId();

    setLightboxState(null);
    setBuyNowVehicle(null);

    if (!nextVehicleId) {
      resetVehicleDetailsState();
      return;
    }

    setVehicleDetailsErrorMessage("");
    setVehicleDetailsWatchErrorMessage("");
    setVehicleDetailsPurchaseMessage("");
    setIsVehicleDetailsWatchPending(false);
    setSelectedVehicleId(nextVehicleId);
  }

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
    function handlePopState() {
      setActiveView(readActiveViewFromUrl());
      syncSelectedVehicleFromUrl();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    syncViewUrl(activeView, { replace: true });
  }, [activeView]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WATCHLIST_COLLAPSED_STORAGE_KEY,
        String(isWatchlistCollapsed),
      );
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [isWatchlistCollapsed]);

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
    if (!selectedVehicleId && !lightboxState && !buyNowVehicle) {
      return undefined;
    }

    function handleEscape(event) {
      if (lightboxState) {
        if (event.key === "Escape") {
          setLightboxState(null);
          return;
        }

        if (event.key === "ArrowLeft") {
          setLightboxState((currentLightboxState) => {
            if (!currentLightboxState || currentLightboxState.images.length <= 1) {
              return currentLightboxState;
            }

            const previousIndex =
              (currentLightboxState.activeIndex - 1 + currentLightboxState.images.length) %
              currentLightboxState.images.length;

            return {
              ...currentLightboxState,
              activeIndex: previousIndex,
            };
          });
          return;
        }

        if (event.key === "ArrowRight") {
          setLightboxState((currentLightboxState) => {
            if (!currentLightboxState || currentLightboxState.images.length <= 1) {
              return currentLightboxState;
            }

            const nextIndex =
              (currentLightboxState.activeIndex + 1) % currentLightboxState.images.length;

            return {
              ...currentLightboxState,
              activeIndex: nextIndex,
            };
          });
          return;
        }
      }

      if (event.key !== "Escape") {
        return;
      }

      if (buyNowVehicle) {
        setBuyNowVehicle(null);
        return;
      }

      closeVehicleDetails();
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [buyNowVehicle, lightboxState, selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicleId && !lightboxState && !buyNowVehicle) {
      return undefined;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [buyNowVehicle, lightboxState, selectedVehicleId]);

  function openImageLightbox(images, activeIndex, vehicleTitle) {
    if (!Array.isArray(images) || !images.length) {
      return;
    }

    const safeIndex = Number.isInteger(activeIndex)
      ? Math.min(Math.max(activeIndex, 0), images.length - 1)
      : 0;

    setLightboxState({
      activeIndex: safeIndex,
      images,
      vehicleTitle,
    });
  }

  function closeImageLightbox() {
    setLightboxState(null);
  }

  function showPreviousLightboxImage() {
    setLightboxState((currentLightboxState) => {
      if (!currentLightboxState || currentLightboxState.images.length <= 1) {
        return currentLightboxState;
      }

      return {
        ...currentLightboxState,
        activeIndex:
          (currentLightboxState.activeIndex - 1 + currentLightboxState.images.length) %
          currentLightboxState.images.length,
      };
    });
  }

  function showNextLightboxImage() {
    setLightboxState((currentLightboxState) => {
      if (!currentLightboxState || currentLightboxState.images.length <= 1) {
        return currentLightboxState;
      }

      return {
        ...currentLightboxState,
        activeIndex: (currentLightboxState.activeIndex + 1) % currentLightboxState.images.length,
      };
    });
  }

  function openVehicleDetails(vehicleId) {
    const normalizedVehicleId = String(vehicleId ?? "").trim();

    if (!normalizedVehicleId) {
      return;
    }

    const hasVehicleInUrl = Boolean(readSharedVehicleId());

    syncVehicleUrl(normalizedVehicleId, {
      replace: hasVehicleInUrl,
    });
    setLightboxState(null);
    setVehicleDetailsPurchaseMessage("");
    setSelectedVehicleId(normalizedVehicleId);
  }

  function closeVehicleDetails() {
    setLightboxState(null);
    setBuyNowVehicle(null);
    resetVehicleDetailsState();
    syncVehicleUrl("", { replace: true });
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

    handleWatchStateChanged({
      isWatched: true,
      vehicleId: payload.vehicle_id,
    });

    if (selectedVehicle?.id === payload.vehicle_id) {
      setSelectedVehicle((currentVehicle) =>
        currentVehicle
          ? {
              ...currentVehicle,
              bid_count: payload.bid_count,
              current_bid: payload.current_bid,
              is_high_bidder: true,
              is_watched: true,
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
        <nav className="inventory-view-nav" aria-label="Primary">
          <button
            aria-pressed={activeView === SEARCH_VIEW}
            className={`inventory-view-tab ${activeView === SEARCH_VIEW ? "is-active" : ""}`}
            type="button"
            onClick={() => openView(SEARCH_VIEW)}
          >
            Search and Buy
          </button>
          <button
            aria-pressed={activeView === PURCHASED_VIEW}
            className={`inventory-view-tab ${activeView === PURCHASED_VIEW ? "is-active" : ""}`}
            type="button"
            onClick={() => openView(PURCHASED_VIEW)}
          >
            Purchased Vehicles
          </button>
        </nav>
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

        {activeView === SEARCH_VIEW ? (
          <>
            <InventorySection
              apiBaseUrl={API_BASE_URL}
              bootstrapErrorMessage={bootstrapErrorMessage}
              collapseLabel="Watchlist"
              currentUserId={CURRENT_USER_ID}
              emptyStateMessage="No watched vehicles match your criteria."
              enableWatchToggle
              filterMetadata={filterMetadata}
              filterOptionsEndpoint={`${API_BASE_URL}/api/users/${CURRENT_USER_ID}/watching/vehicles/filters/options`}
              filterPanelId="watchlist-filters-panel"
              filterSchema={filterSchema}
              filtersPanelLabel="Watchlist filters"
              filtersTitle="Refine watchlist"
              hiddenVehicleIds={soldVehicleIds}
              isBootstrapping={isBootstrapping}
              isSectionCollapsed={isWatchlistCollapsed}
              keepPurchasedLast
              onBidPlaced={handleBidPlaced}
              onRequestBuyNow={handleRequestBuyNow}
              onWatchStateChanged={handleWatchStateChanged}
              onSelectVehicle={openVehicleDetails}
              onToggleSectionCollapsed={() =>
                setIsWatchlistCollapsed((currentCollapsed) => !currentCollapsed)
              }
              panelLabel="Watchlist"
              purchasedVehicleIds={purchasedVehicleIds}
              refreshToken={inventoryRefreshToken}
              searchEndpoint={`${API_BASE_URL}/api/users/${CURRENT_USER_ID}/watching/vehicles/search`}
              sectionCollapseEnabled
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
              filterOptionsEndpoint={`${API_BASE_URL}/api/vehicles/filters/options`}
              filterPanelId="inventory-filters-panel"
              filterSchema={filterSchema}
              filtersPanelLabel="Search filters"
              filtersTitle="Refine inventory"
              hidePurchasedVehicles
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
          </>
        ) : (
          <PurchasedVehiclesSection
            apiBaseUrl={API_BASE_URL}
            currentUserId={CURRENT_USER_ID}
            refreshToken={inventoryRefreshToken}
            onSelectVehicle={openVehicleDetails}
          />
        )}
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
          onOpenImage={(images, activeIndex) =>
            openImageLightbox(
              images,
              activeIndex,
              selectedVehicle
                ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
                : "Vehicle image",
            )
          }
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

      {lightboxState?.images?.length ? (
        <VehicleImageLightbox
          activeIndex={lightboxState.activeIndex}
          images={lightboxState.images}
          onClose={closeImageLightbox}
          onNext={showNextLightboxImage}
          onPrevious={showPreviousLightboxImage}
          vehicleTitle={lightboxState.vehicleTitle}
        />
      ) : null}
    </main>
  );
}
