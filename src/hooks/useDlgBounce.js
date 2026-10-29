import { useState } from "react";

/**
 * One-shot nudge when the user clicks a locked overlay (Continue-only dialogs).
 * After a bounce finishes, keeps `dlg-settled` so we do not re-run mount `dlg-enter`
 * (that restart was shrinking flex CTAs).
 */
export default function useDlgBounce() {
  const [phase, setPhase] = useState("idle"); // idle | bounce | settled

  const bounce = () => {
    // Stay settled (or idle) for a frame so toggling bounce restarts cleanly
    // without briefly falling back to dlg-enter.
    setPhase((p) => (p === "idle" ? "idle" : "settled"));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("bounce"));
    });
  };

  const onBounceEnd = (e) => {
    if (e.target !== e.currentTarget) return;
    if (!String(e.animationName || "").includes("dlg-bounce")) return;
    setPhase("settled");
  };

  const bounceClass =
    phase === "bounce" ? " dlg-bounce" : phase === "settled" ? " dlg-settled" : "";

  return {
    bounce,
    onBounceEnd,
    bounceClass,
  };
}
