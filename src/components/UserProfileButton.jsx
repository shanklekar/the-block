function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 12.25a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M4.75 20a7.25 7.25 0 0 1 14.5 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function UserProfileButton({
  currentUserName = "User",
  isOpen = false,
  onClick,
}) {
  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label={`Open user picker for ${currentUserName}`}
      className="user-profile-button"
      type="button"
      onClick={onClick}
    >
      <span className="user-profile-button-icon" aria-hidden="true">
        <UserIcon />
      </span>
      <span className="user-profile-button-label">{currentUserName}</span>
    </button>
  );
}
