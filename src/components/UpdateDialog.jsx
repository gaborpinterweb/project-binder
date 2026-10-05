import { useEffect, useRef } from "react";
import { Icon } from "../icons.jsx";
import { UPDATE_DOWNLOAD_URL } from "../checkUpdate.js";

const INSTALL_GUIDE =
  "Download the latest version and install it over your current app. Your workspace data is kept across updates.";

export default function UpdateDialog({ notes, url, onClose }) {
  const ctaRef = useRef(null);
  const downloadUrl = url || UPDATE_DOWNLOAD_URL;

  useEffect(() => {
    const t = requestAnimationFrame(() => ctaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dlg prompt-dlg update-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        aria-describedby="update-guide"
      >
        <div className="dlg-content prompt-body">
          <h2 id="update-title" className="prompt-title">
            Update available
          </h2>
          {notes ? (
            <div className="update-notes" aria-label="Release notes">
              <pre className="update-notes-body">{notes}</pre>
            </div>
          ) : null}
          <p id="update-guide" className="prompt-msg">
            {INSTALL_GUIDE}
          </p>
          <div className="actions prompt-actions">
            <button type="button" className="dlg-delete" onClick={onClose}>
              Close
            </button>
            <a
              ref={ctaRef}
              className="dlg-create support-cta update-cta"
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Download update</span>
              <Icon name="external" size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
