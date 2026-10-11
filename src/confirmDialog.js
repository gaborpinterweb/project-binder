let setConfirmState = null;
let resolveConfirm = null;

export function bindConfirmHost(setter) {
  setConfirmState = setter;
}

/**
 * Custom confirm. Resolves true if confirmed, false if cancelled.
 * When altLabel is set, resolves "alt" if that button is chosen.
 */
export function askConfirm({
  title = "Are you sure?",
  message = "",
  confirmLabel = "OK",
  confirmIcon = null,
  cancelLabel = "Cancel",
  altLabel = null,
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    if (resolveConfirm) {
      resolveConfirm(false);
      resolveConfirm = null;
    }
    resolveConfirm = resolve;
    if (!setConfirmState) {
      resolve(false);
      resolveConfirm = null;
      return;
    }
    setConfirmState({
      title,
      message,
      confirmLabel,
      confirmIcon: confirmIcon ? String(confirmIcon) : null,
      cancelLabel,
      altLabel: altLabel ? String(altLabel) : null,
      danger: !!danger,
      stackActions: !!altLabel,
    });
  });
}

export function settleConfirm(value) {
  const resolve = resolveConfirm;
  resolveConfirm = null;
  setConfirmState?.(null);
  if (value === "alt") {
    resolve?.("alt");
    return;
  }
  resolve?.(!!value);
}
