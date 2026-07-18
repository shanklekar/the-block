export default function VehicleImageLightbox({ imageUrl, onClose, vehicleTitle }) {
  return (
    <div className="modal-shell vehicle-lightbox-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop modal-backdrop-strong" onClick={onClose} />
      <section className="vehicle-lightbox">
        <button className="modal-close-button vehicle-lightbox-close" type="button" onClick={onClose}>
          Close
        </button>
        <img alt={vehicleTitle} className="vehicle-lightbox-image" src={imageUrl} />
      </section>
    </div>
  );
}
