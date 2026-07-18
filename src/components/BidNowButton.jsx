import { formatCurrency } from "../inventoryConfig";

export default function BidNowButton({
  amount,
  className = "",
  disabled = false,
  onClick,
}) {
  return (
    <button
      className={["bid-now-button", className].filter(Boolean).join(" ")}
      disabled={disabled}
      type="button"
      onClick={disabled ? undefined : onClick}
    >
      {`Bid now ${formatCurrency(amount)}`}
    </button>
  );
}
