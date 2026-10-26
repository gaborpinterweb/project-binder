let setPaywallState = null;
let resolvePaywall = null;

export function bindPaywallHost(setter) {
  setPaywallState = setter;
}

/** Show the Cloud Pro paywall. Resolves when the dialog closes. */
export function askPaywall() {
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
    setPaywallState(true);
  });
}

export function settlePaywall() {
  const resolve = resolvePaywall;
  resolvePaywall = null;
  setPaywallState?.(null);
  resolve?.();
}
