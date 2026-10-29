import PocketBase from "pocketbase";

/** Same-origin when served from PocketBase; override for Vite → remote PB. */
export function pbBaseUrl() {
  const env = import.meta.env.VITE_PB_URL;
  if (env && String(env).trim()) return String(env).replace(/\/$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** True when the UI should use PocketBase (not Node /api). */
export function isPbMode() {
  if (import.meta.env.VITE_BACKEND === "node") return false;
  if (import.meta.env.VITE_BACKEND === "pb") return true;
  if (import.meta.env.VITE_PB_URL) return true;
  if (typeof window === "undefined") return false;
  const port = String(window.location.port || "");
  // PocketBase default; Node product server uses 3457.
  if (port === "8090") return true;
  // Production self-host: PB serves SPA + API on one origin (not Vite 5173).
  if (import.meta.env.PROD && port !== "3457" && port !== "5173") return true;
  return false;
}

/** True for the Commercial production build (billing UI). Community is the default. */
export function isCommercialMode() {
  return (
    import.meta.env.VITE_COMMERCIAL === "true" ||
    import.meta.env.VITE_COMMERCIAL === "1"
  );
}

function trimUrl(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s || "";
}

/** Polar Checkout Link URL (Commercial builds). */
export function polarCheckoutUrl() {
  return trimUrl(import.meta.env.VITE_POLAR_CHECKOUT_URL);
}

/** Polar customer portal URL (Commercial builds). */
export function polarPortalUrl() {
  return trimUrl(import.meta.env.VITE_POLAR_PORTAL_URL);
}

const DEFAULT_FEEDBACK_URL = "https://projectbinder.app/feedback";

/** Public feedback / contact URL (overridable via `VITE_FEEDBACK_URL`). */
export function feedbackUrl() {
  return trimUrl(import.meta.env.VITE_FEEDBACK_URL) || DEFAULT_FEEDBACK_URL;
}

/** True when the signed-in user has Pro entitlement (Commercial). */
export function isProUser() {
  return !!getPb().authStore.record?.pro;
}

/**
 * Checkout URL with reference_id (and email) so Polar webhooks map to the PB user.
 * @returns {string}
 */
export function polarCheckoutUrlForUser() {
  const base = polarCheckoutUrl();
  if (!base) return "";
  const record = getPb().authStore.record;
  if (!record?.id) return base;
  const parts = [
    `reference_id=${encodeURIComponent(String(record.id))}`,
  ];
  const email = String(record.email || "").trim();
  if (email) parts.push(`customer_email=${encodeURIComponent(email)}`);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${parts.join("&")}`;
}

let pb;

export function getPb() {
  if (!pb) {
    pb = new PocketBase(pbBaseUrl());
    pb.autoCancellation(false);
  }
  return pb;
}
