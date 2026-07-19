import { useEffect, useRef, useState } from "react";
import { buildVehicleShareUrl } from "../vehicleShare";

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M14.5 5.5 19 10m0 0-4.5 4.5M19 10H9.5A4.5 4.5 0 0 0 5 14.5v4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SharedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m5 12.5 4.2 4.2L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function getShareEntityLabel(vehicleTitle, vin) {
  if (vin) {
    return `VIN ${vin}`;
  }

  return vehicleTitle || "this vehicle";
}

export default function VehicleShareButton({
  className = "",
  disabled = false,
  stopPropagation = false,
  variant = "compact",
  vehicleId = "",
  vehicleTitle = "",
  vin = "",
}) {
  const successTimeoutRef = useRef(null);
  const [isShared, setIsShared] = useState(false);
  const hasVehicleId = Boolean(String(vehicleId ?? "").trim());
  const canUseNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const canCopyLink =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function";
  const isUnavailable = !canUseNativeShare && !canCopyLink;
  const shareEntityLabel = getShareEntityLabel(vehicleTitle, vin);
  const shareLabel = isShared
    ? `Shared link for ${shareEntityLabel}`
    : `Share link for ${shareEntityLabel}`;
  const isModalHeaderVariant = variant === "modal-header";
  const isCardInlineVariant = variant === "card-inline";
  const shouldShowLabel = isModalHeaderVariant || isCardInlineVariant;

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsShared(false);
  }, [vehicleId, variant]);

  function showSharedFeedback() {
    setIsShared(true);

    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }

    successTimeoutRef.current = window.setTimeout(() => {
      setIsShared(false);
    }, 1800);
  }

  async function handleShare(event) {
    if (stopPropagation) {
      event.stopPropagation();
    }

    if (disabled || !hasVehicleId) {
      return;
    }

    const shareUrl = buildVehicleShareUrl(vehicleId);
    const shareTitle = vehicleTitle || "Vehicle details";
    const shareText = vin ? `View vehicle ${vin}` : `View ${shareTitle}`;

    try {
      if (canUseNativeShare) {
        await navigator.share({
          text: shareText,
          title: shareTitle,
          url: shareUrl,
        });
        showSharedFeedback();
        return;
      }

      if (!canCopyLink) {
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      showSharedFeedback();
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }

      setIsShared(false);
    }
  }

  return (
    <button
      aria-label={shareLabel}
      className={`vehicle-share-button ${
        isModalHeaderVariant
          ? "vehicle-share-button-modal-header"
          : isCardInlineVariant
            ? "vehicle-share-button-card-inline"
            : "vehicle-card-copy-button vehicle-share-button-compact"
      } ${isShared ? "is-shared" : ""} ${className}`.trim()}
      disabled={disabled || !hasVehicleId || isUnavailable}
      type="button"
      onClick={handleShare}
      onKeyDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
    >
      {isShared ? <SharedIcon /> : <ShareIcon />}
      {shouldShowLabel ? (
        <span className="vehicle-share-button-label">{isShared ? "Shared" : "Share"}</span>
      ) : null}
    </button>
  );
}
