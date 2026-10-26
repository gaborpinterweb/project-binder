import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getPb,
  isProUser,
  lsPortalUrl,
} from "../pb/client.js";
import { showSnackbar } from "../snackbar.js";

const CONFIRM_PHRASE = "delete forever";

function canDeleteAccount() {
  if (!isProUser()) return true;
  return getPb().authStore.record?.proStatus === "cancelled";
}

export default function DeleteAccountDialog({ open, onClose }) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [allowed, setAllowed] = useState(() => canDeleteAccount());
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setPhrase("");
    setError("");
    setBusy(false);
    setRefreshBusy(false);
    setAllowed(canDeleteAccount());
  }, [open]);

  useEffect(() => {
    if (!open || !allowed) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open, allowed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onClose]);

  if (!open) return null;

  const phraseOk = phrase === CONFIRM_PHRASE;

  const openPortal = () => {
    const url = lsPortalUrl();
    if (url) {
      window.open(url, "_blank", "noopener");
      return;
    }
    alert("Portal URL is not configured for this build.");
  };

  const refreshStatus = async () => {
    setRefreshBusy(true);
    setError("");
    try {
      await getPb().collection("users").authRefresh();
      const ok = canDeleteAccount();
      setAllowed(ok);
      if (ok) {
        setPhrase("");
        setError("");
      }
    } catch {
      showSnackbar("Could not refresh subscription status");
    } finally {
      setRefreshBusy(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!allowed || !phraseOk || busy) return;
    const userId = getPb().authStore.record?.id;
    if (!userId) {
      setError("Not signed in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await getPb().collection("users").delete(userId);
      getPb().authStore.clear();
      window.location.reload();
    } catch (err) {
      setBusy(false);
      setError(err?.message || "Could not delete account.");
    }
  };

  return createPortal(
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dlg prompt-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-msg"
      >
        <div className="dlg-content prompt-body">
          <h2 id="delete-account-title" className="prompt-title prompt-title-danger">
            Permanently delete your account?
          </h2>
          <p id="delete-account-msg" className="prompt-msg">
            This cannot be undone. All of your Project Binder data for this
            account — projects, files, and shares — will be permanently removed.
          </p>

          {!allowed ? (
            <div className="delete-account-callout" role="status">
              <p className="delete-account-callout-msg">
                Cancel your Lemon Squeezy subscription before deleting this
                account. Open the customer portal to cancel, then refresh status
                here.
              </p>
              <div className="delete-account-callout-actions">
                <button
                  type="button"
                  className="dlg-create"
                  onClick={openPortal}
                  disabled={busy || refreshBusy}
                >
                  Manage subscription
                </button>
                <button
                  type="button"
                  className="dlg-delete"
                  onClick={() => void refreshStatus()}
                  disabled={busy || refreshBusy}
                >
                  {refreshBusy ? "…" : "Refresh status"}
                </button>
              </div>
            </div>
          ) : (
            <form className="prompt-form" onSubmit={handleDelete}>
              <label className="prompt-field">
                Type <span className="delete-account-phrase">{CONFIRM_PHRASE}</span>{" "}
                to confirm
                <input
                  ref={inputRef}
                  className="prompt-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              {error ? <p className="auth-error">{error}</p> : null}
              <div className="actions prompt-actions">
                <button
                  type="button"
                  className="dlg-delete"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dlg-create prompt-danger"
                  disabled={busy || !phraseOk}
                >
                  {busy ? "…" : "Permanently delete"}
                </button>
              </div>
            </form>
          )}

          {!allowed ? (
            <div className="actions prompt-actions">
              <button
                type="button"
                className="dlg-delete"
                onClick={onClose}
                disabled={busy || refreshBusy}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
