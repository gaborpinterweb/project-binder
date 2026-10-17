import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bindConfirmHost, settleConfirm } from "../confirmDialog.js";
import { Icon } from "../icons.jsx";

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
        e.stopImmediatePropagation();
        settleConfirm(false);
      }
    };
    // Capture so Escape dismisses confirm instead of the dialog underneath.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [req]);

  if (!req) return null;

  const accept = () => settleConfirm(true);
  const cancel = () => settleConfirm(false);

  return createPortal(
    <div
      className="ov ov-prompt ov-confirm"
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
          {req.help?.url ? (
            <p className="prompt-help">
              <a
                className="prompt-help-link"
                href={req.help.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {req.help.label || "Learn more"}
              </a>
            </p>
          ) : null}
          <div
            className={
              "actions prompt-actions" + (req.stackActions ? " prompt-actions-stack" : "")
            }
          >
            {req.stackActions ? (
              <>
                {req.altLabel ? (
                  <button
                    type="button"
                    className="dlg-create"
                    onClick={() => settleConfirm("alt")}
                  >
                    {req.altLabel}
                  </button>
                ) : null}
                <button
                  ref={confirmRef}
                  type="button"
                  className={
                    "dlg-create" +
                    (req.danger ? " prompt-danger" : "") +
                    (req.confirmIcon ? " dlg-create-icon" : "")
                  }
                  onClick={accept}
                >
                  {req.confirmIcon ? <Icon name={req.confirmIcon} size={16} /> : null}
                  {req.confirmLabel}
                </button>
                <button type="button" className="dlg-delete" onClick={cancel}>
                  {req.cancelLabel}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="dlg-delete" onClick={cancel}>
                  {req.cancelLabel}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  className={
                    "dlg-create" +
                    (req.danger ? " prompt-danger" : "") +
                    (req.confirmIcon ? " dlg-create-icon" : "")
                  }
                  onClick={accept}
                >
                  {req.confirmIcon ? <Icon name={req.confirmIcon} size={16} /> : null}
                  {req.confirmLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
