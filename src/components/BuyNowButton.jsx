import { formatCurrency } from "../inventoryConfig";

export default function BuyNowButton({
  className = "",
  isPurchased = false,
  onClick,
  price,
}) {
  const buttonLabel = isPurchased ? "Purchased" : `Buy Now! ${formatCurrency(price)}`;
  const classes = ["buy-now-button", isPurchased ? "is-purchased" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={isPurchased}
      type="button"
      onClick={isPurchased ? undefined : onClick}
    >
      {buttonLabel}
    </button>
  );
}
