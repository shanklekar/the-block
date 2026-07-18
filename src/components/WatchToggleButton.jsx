function EyeOpenIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M1.5 12s3.8-6 10.5-6 10.5 6 10.5 6-3.8 6-10.5 6S1.5 12 1.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M3 4.5 21 19.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.2 6.8A11.5 11.5 0 0 1 12 6c6.7 0 10.5 6 10.5 6a19.2 19.2 0 0 1-3.6 4.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M6.2 8.7A19.4 19.4 0 0 0 1.5 12s3.8 6 10.5 6c1.1 0 2.2-.2 3.2-.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function WatchToggleButton({
  className = "",
  disabled = false,
  isWatched = false,
  label = "",
  onToggle,
}) {
  const buttonText = isWatched ? "Unwatch" : "Watch";

  return (
    <button
      aria-label={label}
      aria-pressed={isWatched}
      className={`vehicle-watch-toggle ${isWatched ? "is-watched" : ""} ${className}`.trim()}
      disabled={disabled}
      type="button"
      onClick={onToggle}
    >
      {isWatched ? <EyeClosedIcon /> : <EyeOpenIcon />}
      <span className="vehicle-watch-toggle-label">{buttonText}</span>
    </button>
  );
}
