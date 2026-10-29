import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bindPaywallHost, settlePaywall } from "../paywallDialog.js";
import { polarCheckoutUrl, polarCheckoutUrlForUser } from "../pb/client.js";
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
    free: "Beginner or part-time freelancers",
    pro: "Profesisonal, full-time freelancers",
  },
];

export default function PaywallDialog() {
  const [open, setOpen] = useState(null);
  const ctaRef = useRef(null);
  const underExistingOverlay = !!open?.underExistingOverlay;
  const highlightFree = open?.highlightFree || "";

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
    const url = polarCheckoutUrlForUser();
    if (url) {
      window.location.assign(url);
      return;
    }
    alert("Checkout URL is not configured for this build.");
  };

  const cancel = () => settlePaywall();

  return createPortal(
    <div
      className={
        "ov ov-prompt ov-paywall" +
        (underExistingOverlay ? " ov-paywall-nested" : "")
      }
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
                <span className="paywall-price-badge">$4.99/m or $49.99/y</span>
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
                <div
                  className={
                    "paywall-plan paywall-plan-free" +
                    (highlightFree && row.free === highlightFree
                      ? " paywall-free-hit"
                      : "")
                  }
                  role="cell"
                >
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
              disabled={!polarCheckoutUrl()}
              onClick={openCheckout}
            >
              Checkout
              <Icon name="external" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
