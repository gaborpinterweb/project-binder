import { useEffect, useState } from "react";
import { bindSnackbarHost, dismissSnackbar } from "../snackbar.js";

export default function Snackbar() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    bindSnackbarHost(setReq);
    return () => bindSnackbarHost(null);
  }, []);

  if (!req) return null;

  return (
    <div className="snackbar-host" aria-live="polite" aria-atomic="true">
      <div className="snackbar" role="status" key={req.id}>
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
