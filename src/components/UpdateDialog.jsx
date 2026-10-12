import { useEffect, useRef } from "react";
import { marked } from "marked";
import { Icon } from "../icons.jsx";
import { UPDATE_DOWNLOAD_URL } from "../checkUpdate.js";

const INSTALL_STEPS = [
  "Download the latest version and install it over your current app.",
  "Quit Project Binder before replacing the app.",
  "Your workspace data is kept across updates.",
];

function notesHtml(notes) {
  if (!notes) return "";
  return marked.parse(notes, { async: false });
}

export default function UpdateDialog({
  notes,
  url,
  releasesUrl,
  matched,
  onClose,
}) {
  const ctaRef = useRef(null);
  const downloadUrl = url || releasesUrl || UPDATE_DOWNLOAD_URL;
  const browseUrl = releasesUrl || UPDATE_DOWNLOAD_URL;
  const html = notesHtml(notes);

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
          <h2 id="update-title" className="prompt-title update-title">
            <Icon name="gift" size={18} />
            Update available
          </h2>
          {html ? (
            <div className="update-notes" aria-label="Release notes">
              <div
                className="update-notes-body"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ) : null}
          <ul id="update-guide" className="update-guide">
            {INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
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
              <span>{matched ? "Download update" : "View releases"}</span>
              <Icon name="external" size={14} />
            </a>
          </div>
          {matched ? (
            <p className="update-meta">
              …or{" "}
              <a href={browseUrl} target="_blank" rel="noopener noreferrer">
                visit the releases page
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
