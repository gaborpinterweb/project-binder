let setSnackbarState = null;
let hideTimer = 0;
let snackbarSeq = 0;

export function bindSnackbarHost(setter) {
  setSnackbarState = setter;
}

/** Show a brief snackbar. Replaces any currently visible one. */
export function showSnackbar({
  message = "",
  durationMs = 4000,
  action = null,
} = {}) {
  if (!message || !setSnackbarState) return;
  window.clearTimeout(hideTimer);
  const id = ++snackbarSeq;
  const actionLabel = action?.label ? String(action.label) : "";
  const onAction = typeof action?.onClick === "function" ? action.onClick : null;
  setSnackbarState({
    id,
    message: String(message),
    actionLabel,
    onAction,
  });
  const ms = Math.max(1000, Number(durationMs) || 4000);
  hideTimer = window.setTimeout(() => {
    if (snackbarSeq === id) dismissSnackbar();
  }, ms);
}

export function dismissSnackbar() {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  setSnackbarState?.(null);
}
