import { formatCurrency } from "../inventoryConfig";

export default function BuyNowConfirmationModal({
  isSubmitting = false,
  onCancel,
  onConfirm,
  vehicle,
}) {
  const vehicleTitle = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="modal-shell buy-now-confirmation-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onCancel} />
      <section className="buy-now-confirmation-modal">
        <div className="buy-now-confirmation-copy">
          <p className="inventory-panel-label">Buy now</p>
          <h2>Purchase this vehicle?</h2>
          <p>
            Confirm purchase for <strong>{vehicleTitle}</strong> at{" "}
            <strong>{formatCurrency(vehicle?.buy_now_price)}</strong>.
          </p>
        </div>

        <div className="buy-now-confirmation-actions">
          <button
            className="buy-now-confirmation-cancel"
            disabled={isSubmitting}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="buy-now-button" disabled={isSubmitting} type="button" onClick={onConfirm}>
            {isSubmitting ? "Purchasing..." : "Yes"}
          </button>
        </div>
      </section>
    </div>
  );
}
