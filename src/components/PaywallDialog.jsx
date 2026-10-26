import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bindPaywallHost, settlePaywall } from "../paywallDialog.js";
import { lsCheckoutUrl, lsCheckoutUrlForUser } from "../pb/client.js";
import { Icon } from "../icons.jsx";

const ROWS = [
  {
    label: "Active projects",
    tip: "How many projects you can keep active at once. Archive or delete a project to free up a slot.",
    free: "3",
    pro: "Unlimited",
  },
  {
    label: "Public read-only links",
    tip: "Share a tab or whole project with a link so clients can review it.",
    free: "None",
    pro: "Unlimited",
  },
  {
    label: "Total storage",
    tip: "The combined size of all your files, attachments, and data.",
    free: "200 MB",
    pro: "Unlimited",
  },
  {
    label: "Who's it for",
    free: "Beginner freelancers, part-time freelancers or pro freelancers testing the waters",
    pro: "Committed, full-time freelancers with a large client base",
  },
];

export default function PaywallDialog() {
  const [open, setOpen] = useState(null);
  const ctaRef = useRef(null);

  useEffect(() => {
    bindPaywallHost(setOpen);
    return () => bindPaywallHost(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => ctaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        settlePaywall();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  const openCheckout = () => {
    const url = lsCheckoutUrlForUser();
    if (url) {
      window.open(url, "_blank", "noopener");
      settlePaywall();
      return;
    }
    alert("Checkout URL is not configured for this build.");
  };

  const cancel = () => settlePaywall();

  return createPortal(
    <div
      className="ov ov-prompt ov-paywall"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        className="dlg prompt-dlg paywall-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
      >
        <div className="dlg-content paywall-body">
          <header className="paywall-head">
            <h2 id="paywall-title" className="paywall-title">
              Get <span className="paywall-unlimited">unlimited</span> room to grow
            </h2>
          </header>

          <div className="paywall-compare" role="table" aria-label="Plan comparison">
            <div className="paywall-compare-head" role="row">
              <div className="paywall-compare-label" role="columnheader" />
              <div className="paywall-plan paywall-plan-free" role="columnheader">
                <span className="paywall-plan-name">Cloud Free</span>
              </div>
              <div className="paywall-plan paywall-plan-pro" role="columnheader">
                <span className="paywall-plan-name">Cloud Pro</span>
              </div>
            </div>
            {ROWS.map((row) => (
              <div className="paywall-compare-row" role="row" key={row.label}>
                <div className="paywall-compare-label" role="rowheader">
                  <span className="paywall-feature-text">{row.label}</span>
                  {row.tip ? (
                    <button
                      type="button"
                      className="paywall-tip"
                      data-tip={row.tip}
                      aria-label={row.tip}
                    >
                      <Icon name="About" size={13} />
                    </button>
                  ) : null}
                </div>
                <div className="paywall-plan paywall-plan-free" role="cell">
                  {row.free}
                </div>
                <div className="paywall-plan paywall-plan-pro" role="cell">
                  {row.pro}
                </div>
              </div>
            ))}
          </div>

          <div className="actions prompt-actions paywall-actions">
            <button
              ref={ctaRef}
              type="button"
              className="dlg-create dlg-create-icon paywall-cta"
              disabled={!lsCheckoutUrl()}
              onClick={openCheckout}
            >
              Open Cloud Pro plans
              <Icon name="external" size={15} />
            </button>
            <p className="paywall-meta">
              <span className="paywall-meta-check" aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
              No-questions-asked refund available for 14 days
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
