import { useEffect, useRef, useState } from "react";
import { bindConfirmHost, settleConfirm } from "../confirmDialog.js";

export default function ConfirmDialog() {
  const [req, setReq] = useState(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    bindConfirmHost(setReq);
    return () => bindConfirmHost(null);
  }, []);

  useEffect(() => {
    if (!req) return;
    const t = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settleConfirm(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  const accept = () => settleConfirm(true);
  const cancel = () => settleConfirm(false);

  return (
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        className="dlg prompt-dlg confirm-dlg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={req.message ? "confirm-msg" : undefined}
      >
        <div className="dlg-content prompt-body">
          <h2 id="confirm-title" className="prompt-title">
            {req.title}
          </h2>
          {req.message ? (
            <p id="confirm-msg" className="prompt-msg prompt-msg-pre">
              {req.message}
            </p>
          ) : null}
          <div
            className={
              "actions prompt-actions" + (req.stackActions ? " prompt-actions-stack" : "")
            }
          >
            <button type="button" className="dlg-delete" onClick={cancel}>
              {req.cancelLabel}
            </button>
            {req.altLabel ? (
              <button type="button" className="dlg-create" onClick={() => settleConfirm("alt")}>
                {req.altLabel}
              </button>
            ) : null}
            <button
              ref={confirmRef}
              type="button"
              className={req.danger ? "dlg-create prompt-danger" : "dlg-create"}
              onClick={accept}
            >
              {req.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
