import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  feedbackUrl,
  getPb,
  isCommercialMode,
  isProUser,
} from "../pb/client.js";
import { navigatePath } from "../routes.js";
import { Icon } from "../icons.jsx";
import useDlgBounce from "../hooks/useDlgBounce.js";

function feedbackLinkLabel(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/$/, "") || url;
  } catch {
    return url;
  }
}

const POLL_MS = 1500;
const TIMEOUT_MS = 45000;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Small burst of canvas confetti; no-op when reduced motion. */
function burstConfetti(canvas) {
  if (!canvas || prefersReducedMotion()) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const colors = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#a855f7", "#ec4899"];
  const parts = Array.from({ length: 64 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    return {
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: window.innerHeight * 0.38,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      g: 0.2 + Math.random() * 0.14,
      w: 8 + Math.random() * 10,
      h: 12 + Math.random() * 12,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1,
    };
  });
  let raf = 0;
  const start = performance.now();
  const tick = (now) => {
    const t = (now - start) / 2000;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - t);
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 1) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
  raf = requestAnimationFrame(tick);
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
}

/**
 * Poll auth for Pro entitlement after checkout (or standalone).
 * @param {{
 *   open: boolean,
 *   checkoutId?: string,
 *   emulate?: boolean,
 *   onClose: () => void,
 *   onConfirmed: () => void,
 * }} props
 */
export default function ConfirmProDialog({
  open,
  checkoutId = "",
  emulate = false,
  onClose,
  onConfirmed,
}) {
  const [phase, setPhase] = useState("waiting"); // waiting | success | failed
  const [pollKey, setPollKey] = useState(0);
  const canvasRef = useRef(null);
  const confirmedNotified = useRef(false);
  const { bounce, onBounceEnd, bounceClass } = useDlgBounce();

  useEffect(() => {
    if (!open) {
      setPhase("waiting");
      setPollKey(0);
      confirmedNotified.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !isCommercialMode()) return;
    let cancelled = false;
    let intervalId = 0;
    const started = Date.now();
    setPhase("waiting");
    confirmedNotified.current = false;

    const finishSuccess = () => {
      if (cancelled) return;
      setPhase("success");
      if (!confirmedNotified.current) {
        confirmedNotified.current = true;
        onConfirmed?.();
        navigatePath("/", { replace: true, search: "" });
      }
    };

    // Dev-only UI path (`/confirm-pro?emulate=true`); ignored in production builds.
    if (emulate) {
      const t = window.setTimeout(finishSuccess, 700);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    const tick = async () => {
      try {
        await getPb().collection("users").authRefresh();
      } catch {
        /* keep polling */
      }
      if (cancelled) return;
      if (isProUser()) {
        clearInterval(intervalId);
        finishSuccess();
        return;
      }
      if (Date.now() - started >= TIMEOUT_MS) {
        clearInterval(intervalId);
        setPhase("failed");
      }
    };

    void tick();
    intervalId = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [open, pollKey, onConfirmed, emulate]);

  useEffect(() => {
    if (!open || phase !== "success") return;
    return burstConfetti(canvasRef.current);
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Dismiss only via dialog buttons (Continue / Close), never Escape while pending.
      if (phase === "waiting" || phase === "success") return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, phase]);

  if (!open) return null;

  const restart = () => setPollKey((n) => n + 1);

  const openContact = () => {
    const url = feedbackUrl();
    if (url) window.open(url, "_blank", "noopener");
  };

  const supportUrl = feedbackUrl();

  return createPortal(
    <div
      className="ov ov-prompt ov-confirm-pro"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        bounce();
      }}
    >
      <canvas
        ref={canvasRef}
        className="confirm-pro-confetti"
        aria-hidden="true"
      />
      <div
        className={"dlg prompt-dlg confirm-pro-dlg" + bounceClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-pro-title"
        aria-describedby="confirm-pro-msg"
        onAnimationEnd={onBounceEnd}
      >
        <div className="dlg-content prompt-body confirm-pro-body">
          {phase === "waiting" ? (
            <>
              
              <p id="confirm-pro-msg" className="prompt-msg confirm-pro-waiting">
                <span className="workspace-boot-spinner" aria-hidden="true" />
                <span>Confirming your Cloud Pro access...</span>
              </p>
            </>
          ) : null}

          {phase === "success" ? (
            <div className="confirm-pro-success">
              <div className="confirm-pro-success-copy">
                <span className="confirm-pro-success-icon" aria-hidden="true">
                  <Icon name="circleCheck" size={28} />
                </span>
                <div>
                  <h2 id="confirm-pro-title" className="prompt-title">
                    Cloud Pro plan confirmed
                  </h2>
                </div>
                <ul className="confirm-pro-perks">
                  <li>
                    <span className="confirm-pro-perk-icon" aria-hidden="true">
                      <Icon name="folders" size={16} />
                    </span>
                    <span>Unlimited active projects</span>
                  </li>
                  <li>
                    <span className="confirm-pro-perk-icon" aria-hidden="true">
                      <Icon name="link" size={16} />
                    </span>
                    <span>Unlimited public read-only links</span>
                  </li>
                  <li>
                    <span className="confirm-pro-perk-icon" aria-hidden="true">
                      <Icon name="Database" size={16} />
                    </span>
                    <span>Unlimited total storage</span>
                  </li>
                  <li>
                    <span className="confirm-pro-perk-icon" aria-hidden="true">
                      <Icon name="Help" size={16} />
                    </span>
                    <span>
                      Priority support at{" "}
                      <a
                        href={supportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {feedbackLinkLabel(supportUrl)}
                      </a>
                    </span>
                  </li>
                </ul>
              </div>
              <div className="actions prompt-actions">
                <button
                  type="button"
                  className="dlg-create"
                  onClick={onClose}
                  autoFocus
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {phase === "failed" ? (
            <>
              <h2 id="confirm-pro-title" className="prompt-title">
                Cloud Pro confirmation failed
              </h2>
              <p id="confirm-pro-msg" className="prompt-msg">
                Cloud Pro confirmation timed out, please try again. If you believe
                this to be an error, please contact us.
              </p>
              {checkoutId ? (
                <p className="confirm-pro-checkout-id">
                  <span className="confirm-pro-checkout-label">Checkout ID</span>
                  <code>{checkoutId}</code>
                </p>
              ) : null}
              <div className="actions prompt-actions prompt-actions-stack">
                <button type="button" className="dlg-create" onClick={restart}>
                  Refresh
                </button>
                <button
                  type="button"
                  className="dlg-delete"
                  onClick={openContact}
                >
                  Contact us
                </button>
                <button type="button" className="dlg-delete" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
