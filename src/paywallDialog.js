let setPaywallState = null;
let resolvePaywall = null;

export function bindPaywallHost(setter) {
  setPaywallState = setter;
}

/**
 * Show the Cloud Pro paywall. Resolves when the dialog closes.
 * @param {{
 *   underExistingOverlay?: boolean,
 *   highlightFree?: string,
 * }} [opts]
 *   underExistingOverlay — skip the dimmed backdrop (caller keeps theirs).
 *   highlightFree — Free-column cell value to emphasize in red (e.g. "3", "None").
 */
export function askPaywall(opts = {}) {
  const underExistingOverlay = !!opts.underExistingOverlay;
  const highlightFree =
    opts.highlightFree != null && opts.highlightFree !== ""
      ? String(opts.highlightFree)
      : "";
  return new Promise((resolve) => {
    if (resolvePaywall) {
      resolvePaywall();
      resolvePaywall = null;
    }
    resolvePaywall = resolve;
    if (!setPaywallState) {
      resolve();
      resolvePaywall = null;
      return;
    }
    setPaywallState({ underExistingOverlay, highlightFree });
  });
}

export function settlePaywall() {
  const resolve = resolvePaywall;
  resolvePaywall = null;
  setPaywallState?.(null);
  resolve?.();
}
