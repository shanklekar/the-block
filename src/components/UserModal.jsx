import { useEffect, useState } from "react";

function UserModalIcon() {
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

export default function UserModal({
  createErrorMessage = "",
  currentUserId = null,
  isCreatePending = false,
  isOpen = false,
  onClose,
  onCreateUser,
  onSelectUser,
  users = [],
}) {
  const [newUserName, setNewUserName] = useState("");
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setNewUserName("");
      setValidationMessage("");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleCreateUserSubmit(event) {
    event.preventDefault();

    const normalizedUserName = newUserName.trim();
    if (!normalizedUserName) {
      setValidationMessage("Enter a user name to create a new profile.");
      return;
    }

    setValidationMessage("");
    const createdUser = await onCreateUser?.(normalizedUserName);

    if (createdUser) {
      setNewUserName("");
    }
  }

  return (
    <div className="modal-shell user-modal-shell" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <section className="user-modal">
        <header className="user-modal-header">
          <div>
            <p className="inventory-panel-label">User profile</p>
            <h2>Choose the active user</h2>
            <p className="user-modal-copy">
              Watchlist, bids, and purchases update to match the selected profile.
            </p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="user-modal-content">
          <section className="user-modal-section">
            <h3>Users</h3>
            <div className="user-modal-list" role="list">
              {users.map((user) => {
                const isActive = user.user_id === currentUserId;

                return (
                  <button
                    aria-pressed={isActive}
                    className={`user-modal-user ${isActive ? "is-active" : ""}`.trim()}
                    key={user.user_id}
                    type="button"
                    onClick={() => onSelectUser?.(user.user_id)}
                  >
                    <span className="user-modal-user-icon" aria-hidden="true">
                      <UserModalIcon />
                    </span>
                    <span className="user-modal-user-copy">
                      <strong>{user.user_name}</strong>
                      <span>ID #{user.user_id}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="user-modal-section">
            <h3>Create new user</h3>
            <form className="user-modal-form" noValidate onSubmit={handleCreateUserSubmit}>
              <label className="user-modal-field">
                <span className="user-modal-field-label">User name</span>
                <input
                  autoComplete="off"
                  className="filter-input"
                  maxLength={100}
                  name="user_name"
                  placeholder="Enter a new user name"
                  type="text"
                  value={newUserName}
                  onChange={(event) => setNewUserName(event.target.value)}
                />
              </label>

              {validationMessage || createErrorMessage ? (
                <div className="inventory-feedback error" role="alert">
                  {validationMessage || createErrorMessage}
                </div>
              ) : null}

              <button
                className="inventory-clear-button user-modal-create-button"
                disabled={isCreatePending}
                type="submit"
              >
                {isCreatePending ? "Creating user..." : "Create new user"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </div>
  );
}
