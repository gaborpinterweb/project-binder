import { useEffect, useRef, useState } from "react";
import {
  disableShare,
  enableProjectShare,
  enableTabShare,
  getShareLink,
} from "../api.js";

/**
 * @param {{
 *   projectId: string,
 *   tabId: string | null,
 *   scope: "project" | "tab",
 *   targetName?: string,
 *   initiallyEnabled: boolean,
 *   projectShareEnabled?: boolean,
 *   onClose: () => void,
 *   onApplied: () => void,
 *   onGoToCoverShare?: () => void,
 * }} props
 */
export default function SharingSettingsDialog({
  projectId,
  tabId,
  scope,
  targetName = "",
  initiallyEnabled,
  projectShareEnabled = false,
  onClose,
  onApplied,
  onGoToCoverShare,
}) {
  const lockedByProject = scope === "tab" && !!projectShareEnabled;
  const [mode, setMode] = useState(initiallyEnabled ? "anyone" : "me");
  const [url, setUrl] = useState(() => getShareLink(projectId, tabId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);

  useEffect(() => {
    setMode(initiallyEnabled ? "anyone" : "me");
    setUrl(getShareLink(projectId, tabId));
    setCopied(false);
  }, [projectId, tabId, initiallyEnabled]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const apply = async (next) => {
    if (busy || lockedByProject || next === mode) return;
    setBusy(true);
    setError("");
    try {
      if (next === "anyone") {
        const result =
          scope === "project"
            ? await enableProjectShare(projectId)
            : await enableTabShare(projectId, tabId);
        setMode("anyone");
        setUrl(result.url);
        onApplied?.();
      } else {
        const result = await disableShare(projectId, tabId);
        setMode("me");
        setUrl(result.url || getShareLink(projectId, tabId));
        onApplied?.();
      }
    } catch (err) {
      setError(err?.message || "Could not update sharing");
      setMode(initiallyEnabled ? "anyone" : "me");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!url || busy) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = 0;
      }, 2000);
    } catch {
      setError("Could not copy link");
    }
  };

  const titleName =
    String(targetName || "").trim() || (scope === "project" ? "project" : "tab");
  const title = `Sharing for ${titleName}`;
  const options = [
    { id: "me", title: "No sharing" },
    { id: "anyone", title: "Public read-only link" },
  ];

  return (
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dlg sharing-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sharing-panel">
          <div className="sharing-panel-head">
            <h2 className="sharing-title">{title}</h2>
          </div>

          {lockedByProject ? (
            <div className="sharing-panel-body sharing-locked" role="status">
              <p className="sharing-locked-copy">
                Shared with the project. Change this on Cover.
              </p>
              {onGoToCoverShare ? (
                <button
                  type="button"
                  className="sharing-text-btn"
                  onClick={onGoToCoverShare}
                >
                  Open Cover sharing
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div
                className="sharing-options"
                role="radiogroup"
                aria-label="Who can access"
              >
                {options.map((opt) => {
                  const on = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={"sharing-option" + (on ? " on" : "")}
                      disabled={busy}
                      onClick={() => apply(opt.id)}
                    >
                      <span className="sharing-option-label">{opt.title}</span>
                      {on ? (
                        <span className="sharing-option-check" aria-hidden="true">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {mode === "anyone" && url ? (
                <div className="sharing-link-row">
                  <a
                    className="sharing-link-anchor"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {url}
                  </a>
                  <button
                    type="button"
                    className={"sharing-text-btn" + (copied ? " is-copied" : "")}
                    onClick={copyLink}
                    disabled={busy}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : null}
            </>
          )}

          {error ? <p className="sharing-error">{error}</p> : null}

          <button
            type="button"
            className="sharing-done"
            onClick={onClose}
            disabled={busy}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
