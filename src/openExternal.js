/** Installed PWA / Chrome app (not a normal browser tab). */
export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.standalone) return true;
  if (!window.matchMedia) return false;
  return window.matchMedia(
    "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
  ).matches;
}

/**
 * Cross-origin http(s) or mailto/tel/sms. Same-origin app routes, hashes,
 * pb-blob, blob, and javascript: are not external.
 */
export function isExternalHref(href) {
  if (href == null) return false;
  const raw = String(href).trim();
  if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("javascript:")) {
    return false;
  }
  if (/^(mailto|tel|sms):/i.test(raw)) return true;
  if (/^(pb-blob|blob):/i.test(raw)) return false;
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.href : undefined);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (typeof window === "undefined") return true;
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Open an external URL in a new tab (browser window when running as installed app). */
export function openExternal(url) {
  if (!url) return;
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }
}
