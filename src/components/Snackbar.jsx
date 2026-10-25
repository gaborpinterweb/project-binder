import { useEffect, useState } from "react";
import { Icon } from "../icons.jsx";
import { bindSnackbarHost, dismissSnackbar } from "../snackbar.js";

export default function Snackbar() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    bindSnackbarHost(setReq);
    return () => bindSnackbarHost(null);
  }, []);

  if (!req) return null;

  const hostClass = req.center ? "snackbar-host snackbar-host--center" : "snackbar-host";
  const barClass = req.tone ? `snackbar snackbar--${req.tone}` : "snackbar";

  return (
    <div className={hostClass} aria-live="polite" aria-atomic="true">
      <div className={barClass} role="status" key={req.id}>
        <span className="snackbar-icon" aria-hidden="true">
          <Icon name={req.icon || "bell"} size={18} />
        </span>
        <p className="snackbar-msg">{req.message}</p>
        {req.actionLabel && req.onAction ? (
          <button
            type="button"
            className="snackbar-action"
            onClick={() => {
              const fn = req.onAction;
              dismissSnackbar();
              fn();
            }}
          >
            {req.actionLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="snackbar-dismiss"
          aria-label="Dismiss"
          onClick={dismissSnackbar}
        >
          ×
        </button>
      </div>
    </div>
  );
}
