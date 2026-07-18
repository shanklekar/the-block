function NavigationIcon({ direction }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d={direction === "previous" ? "m14.5 5-7 7 7 7" : "m9.5 5 7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export default function VehicleImageLightbox({
  activeIndex,
  images,
  onClose,
  onNext,
  onPrevious,
  vehicleTitle,
}) {
  const hasMultipleImages = images.length > 1;
  const activeImageUrl = images[activeIndex] ?? images[0] ?? "";

  return (
    <div className="modal-shell vehicle-lightbox-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop modal-backdrop-strong" onClick={onClose} />
      <section className="vehicle-lightbox">
        <div className="vehicle-lightbox-toolbar">
          <span className="vehicle-lightbox-counter">
            {activeIndex + 1} / {images.length}
          </span>
          <button className="modal-close-button vehicle-lightbox-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {hasMultipleImages ? (
          <button
            aria-label="View previous vehicle photo"
            className="vehicle-lightbox-nav vehicle-lightbox-nav-previous"
            type="button"
            onClick={onPrevious}
          >
            <NavigationIcon direction="previous" />
          </button>
        ) : null}

        <img
          alt={`${vehicleTitle} photo ${activeIndex + 1}`}
          className="vehicle-lightbox-image"
          src={activeImageUrl}
        />

        {hasMultipleImages ? (
          <button
            aria-label="View next vehicle photo"
            className="vehicle-lightbox-nav vehicle-lightbox-nav-next"
            type="button"
            onClick={onNext}
          >
            <NavigationIcon direction="next" />
          </button>
        ) : null}
      </section>
    </div>
  );
}
