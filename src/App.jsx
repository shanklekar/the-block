import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "./inventoryConfig";
import BuyNowConfirmationModal from "./components/BuyNowConfirmationModal";
import InventorySection from "./components/InventorySection";
import OpenlaneLogo from "./components/OpenlaneLogo";
import PurchasedVehiclesSection from "./components/PurchasedVehiclesSection";
import UserModal from "./components/UserModal";
import UserProfileButton from "./components/UserProfileButton";
import VehicleDetailsModal from "./components/VehicleDetailsModal";
import VehicleImageLightbox from "./components/VehicleImageLightbox";
import { buildVehicleHistoryPath, readSharedVehicleId } from "./vehicleShare";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
const SEARCH_VIEW = "search";
const PURCHASED_VIEW = "purchased";
const PURCHASED_VEHICLES_SEGMENT = "purchased_vehicles";
const APP_BASE_PATH = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const DEFAULT_USER_ID = 1;
const WATCHLIST_COLLAPSED_STORAGE_KEY = "block.watchlist.collapsed";
const ACTIVE_USER_STORAGE_KEY = "block.active-user-id";

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

function readStoredUserId() {
  try {
    const storedValue = window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    if (!storedValue) {
      return null;
    }

    const parsedValue = Number.parseInt(storedValue, 10);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
  } catch {
    return null;
  }
}

function sortUsers(users = []) {
  return [...users].sort(
    (leftUser, rightUser) =>
      leftUser.user_name.localeCompare(rightUser.user_name, undefined, {
        sensitivity: "base",
      }) || leftUser.user_id - rightUser.user_id,
  );
}

function resolveInitialUserId(users = []) {
  if (!users.length) {
    return null;
  }

  const availableUserIds = new Set(users.map((user) => user.user_id));
  const storedUserId = readStoredUserId();

  if (storedUserId !== null && availableUserIds.has(storedUserId)) {
    return storedUserId;
  }

  if (availableUserIds.has(DEFAULT_USER_ID)) {
    return DEFAULT_USER_ID;
  }

  return users[0]?.user_id ?? null;
}

function buildUserScopedEndpoint(userId, suffix) {
  return `${API_BASE_URL}/api/users/${userId}${suffix}`;
}

function formatApiErrorMessage(detail, fallbackMessage) {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const [firstError] = detail;
    if (typeof firstError?.msg === "string" && firstError.msg.trim()) {
      return firstError.msg;
    }
  }

  return fallbackMessage;
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
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isCreateUserPending, setIsCreateUserPending] = useState(false);
  const [createUserErrorMessage, setCreateUserErrorMessage] = useState("");
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
  const lastResolvedUserIdRef = useRef(null);

  const currentUser = users.find((user) => user.user_id === currentUserId) ?? null;
  const currentUserName = currentUser?.user_name ?? "User";
  const purchaseMutationEndpoint =
    currentUserId === null ? "" : buildUserScopedEndpoint(currentUserId, "/purchased");
  const watchMutationEndpoint =
    currentUserId === null ? "" : buildUserScopedEndpoint(currentUserId, "/watching");
  const watchedFilterOptionsEndpoint =
    currentUserId === null
      ? ""
      : buildUserScopedEndpoint(currentUserId, "/watching/vehicles/filters/options");
  const watchedSearchEndpoint =
    currentUserId === null
      ? ""
      : buildUserScopedEndpoint(currentUserId, "/watching/vehicles/search");

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
    if (currentUserId === null) {
      throw new Error("Unable to load vehicle details.");
    }

    const response = await fetch(
      `${API_BASE_URL}/api/vehicles/${vehicleId}?user_id=${currentUserId}`,
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

        const [schemaResponse, metadataResponse, usersResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/vehicles/filters/schema`, {
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/api/vehicles/filters/metadata`, {
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/api/users`, {
            signal: controller.signal,
          }),
        ]);

        if (!schemaResponse.ok || !metadataResponse.ok || !usersResponse.ok) {
          throw new Error("Unable to load app data.");
        }

        const [schemaPayload, metadataPayload, usersPayload] = await Promise.all([
          schemaResponse.json(),
          metadataResponse.json(),
          usersResponse.json(),
        ]);
        const sortedUsers = sortUsers(usersPayload);
        const initialUserId = resolveInitialUserId(sortedUsers);

        if (initialUserId === null) {
          throw new Error("No users available.");
        }

        setUsers(sortedUsers);
        setCurrentUserId(initialUserId);
        lastResolvedUserIdRef.current = initialUserId;
        setFilterSchema(schemaPayload);
        setFilterMetadata(metadataPayload);
      } catch (error) {
        if (error.name !== "AbortError") {
          setBootstrapErrorMessage("We couldn't load the app right now.");
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
    if (currentUserId === null) {
      return;
    }

    try {
      window.localStorage.setItem(ACTIVE_USER_STORAGE_KEY, String(currentUserId));
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId === null) {
      return;
    }

    if (lastResolvedUserIdRef.current === null) {
      lastResolvedUserIdRef.current = currentUserId;
      return;
    }

    if (lastResolvedUserIdRef.current === currentUserId) {
      return;
    }

    lastResolvedUserIdRef.current = currentUserId;
    setPurchaseFeedbackMessage("");
    setPurchaseFeedbackTone("info");
    setVehicleDetailsErrorMessage("");
    setVehicleDetailsWatchErrorMessage("");
    setVehicleDetailsPurchaseMessage("");
    setIsVehicleDetailsWatchPending(false);
    setLightboxState(null);
    setBuyNowVehicle(null);
    setPurchasedVehicleIds({});
    setSoldVehicleIds({});
    setInventoryRefreshToken((currentValue) => currentValue + 1);
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedVehicleId || currentUserId === null) {
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
  }, [currentUserId, selectedVehicleId]);

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
    if (!selectedVehicleId && !lightboxState && !buyNowVehicle && !isUserModalOpen) {
      return undefined;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [buyNowVehicle, isUserModalOpen, lightboxState, selectedVehicleId]);

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

  function handleSelectUser(nextUserId) {
    setCreateUserErrorMessage("");
    setIsUserModalOpen(false);

    if (nextUserId === currentUserId) {
      return;
    }

    setCurrentUserId(nextUserId);
  }

  async function handleCreateUser(userName) {
    setIsCreateUserPending(true);
    setCreateUserErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_name: userName,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCreateUserErrorMessage(
          formatApiErrorMessage(payload.detail, "We couldn't create that user right now."),
        );
        return null;
      }

      setUsers((currentUsers) => sortUsers([...currentUsers, payload]));

      if (currentUserId === null) {
        setCurrentUserId(payload.user_id);
      }

      return payload;
    } catch {
      setCreateUserErrorMessage("We couldn't create that user right now.");
      return null;
    } finally {
      setIsCreateUserPending(false);
    }
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
    if (!buyNowVehicle || isBuyNowPending || !purchaseMutationEndpoint) {
      return;
    }

    const vehicleId = buyNowVehicle.id;
    setIsBuyNowPending(true);
    setPurchaseFeedbackMessage("");
    setVehicleDetailsPurchaseMessage("");

    try {
      const response = await fetch(purchaseMutationEndpoint, {
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
    if (!selectedVehicle || !watchMutationEndpoint) {
      return;
    }

    setVehicleDetailsWatchErrorMessage("");
    setIsVehicleDetailsWatchPending(true);

    try {
      const response = await fetch(watchMutationEndpoint, {
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
        <div className="inventory-hero-copy-row">
          <p className="inventory-hero-copy">
            <strong>Wholesale made easy</strong>
          </p>
          <UserProfileButton
            currentUserName={currentUserName}
            isOpen={isUserModalOpen}
            onClick={() => {
              setCreateUserErrorMessage("");
              setIsUserModalOpen(true);
            }}
          />
        </div>
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

        {currentUserId === null ? (
          <div className={bootstrapErrorMessage ? "inventory-feedback error" : "inventory-feedback"}>
            {bootstrapErrorMessage || "Loading user profile..."}
          </div>
        ) : activeView === SEARCH_VIEW ? (
          <>
            <InventorySection
              apiBaseUrl={API_BASE_URL}
              bootstrapErrorMessage={bootstrapErrorMessage}
              collapseLabel="Watchlist"
              currentUserId={currentUserId}
              emptyStateMessage="No watched vehicles match your criteria."
              enableWatchToggle
              filterMetadata={filterMetadata}
              filterOptionsEndpoint={watchedFilterOptionsEndpoint}
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
              searchEndpoint={watchedSearchEndpoint}
              sectionCollapseEnabled
              sectionTitle={(totalVehicles) =>
                totalVehicles > 0
                  ? `${totalVehicles.toLocaleString()} watched vehicles ready to review`
                  : "Your watchlist"
              }
              showInlineBidding
              sortLabel="Sort by"
              watchMutationEndpoint={watchMutationEndpoint}
            />

            <InventorySection
              apiBaseUrl={API_BASE_URL}
              bootstrapErrorMessage={bootstrapErrorMessage}
              currentUserId={currentUserId}
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
              sectionTitle={(totalVehicles) =>
                totalVehicles > 0
                  ? `${totalVehicles.toLocaleString()} vehicles ready to review`
                  : "Inventory results"
              }
              sortLabel="Sort by"
              watchMutationEndpoint={watchMutationEndpoint}
            />
          </>
        ) : (
          <PurchasedVehiclesSection
            apiBaseUrl={API_BASE_URL}
            currentUserId={currentUserId}
            refreshToken={inventoryRefreshToken}
            onSelectVehicle={openVehicleDetails}
          />
        )}
      </section>

      <UserModal
        createErrorMessage={createUserErrorMessage}
        currentUserId={currentUserId}
        isCreatePending={isCreateUserPending}
        isOpen={isUserModalOpen}
        users={users}
        onClose={() => {
          setCreateUserErrorMessage("");
          setIsUserModalOpen(false);
        }}
        onCreateUser={handleCreateUser}
        onSelectUser={handleSelectUser}
      />

      {selectedVehicleId ? (
        <VehicleDetailsModal
          apiBaseUrl={API_BASE_URL}
          currentUserId={currentUserId}
          errorMessage={vehicleDetailsErrorMessage}
          isLoading={isVehicleDetailsLoading}
          isPurchased={Boolean(
            selectedVehicle &&
              (selectedVehicle.is_purchased_by_user ||
                purchasedVehicleIds[selectedVehicle.id]),
          )}
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
          purchaseMessage={vehicleDetailsPurchaseMessage}
          vehicle={selectedVehicle}
          watchErrorMessage={vehicleDetailsWatchErrorMessage}
        />
      ) : null}

      {buyNowVehicle ? (
        <BuyNowConfirmationModal
          isSubmitting={isBuyNowPending}
          vehicle={buyNowVehicle}
          onCancel={() => setBuyNowVehicle(null)}
          onConfirm={handleConfirmBuyNow}
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
