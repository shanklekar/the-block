import { formatCurrency } from "../inventoryConfig";

export default function BidNowButton({
  amount,
  className = "",
  disabled = false,
  label,
  onClick,
}) {
  return (
    <button
      className={["bid-now-button", className].filter(Boolean).join(" ")}
      disabled={disabled}
      type="button"
      onClick={disabled ? undefined : onClick}
    >
      {label ?? `Bid now ${formatCurrency(amount)}`}
    </button>
  );
}
