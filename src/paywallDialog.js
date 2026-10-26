let setPaywallState = null;
let resolvePaywall = null;

export function bindPaywallHost(setter) {
  setPaywallState = setter;
}

/**
 * Show the Cloud Pro paywall. Resolves when the dialog closes.
 * @param {{ underExistingOverlay?: boolean }} [opts]
 *   When underExistingOverlay, skip the dimmed backdrop (caller keeps theirs).
 */
export function askPaywall(opts = {}) {
  const underExistingOverlay = !!opts.underExistingOverlay;
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
    setPaywallState({ underExistingOverlay });
  });
}

export function settlePaywall() {
  const resolve = resolvePaywall;
  resolvePaywall = null;
  setPaywallState?.(null);
  resolve?.();
}
