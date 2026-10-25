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
  persist = false,
  icon = "bell",
  /** @type {null | "success" | "error" | "info"} */
  tone = null,
  /** Full-width bottom (auth screens; no sidebar offset). */
  center = false,
} = {}) {
  if (!message || !setSnackbarState) return;
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  const id = ++snackbarSeq;
  const actionLabel = action?.label ? String(action.label) : "";
  const onAction = typeof action?.onClick === "function" ? action.onClick : null;
  const toneOk = tone === "success" || tone === "error" || tone === "info" ? tone : null;
  setSnackbarState({
    id,
    message: String(message),
    actionLabel,
    onAction,
    icon: icon ? String(icon) : "bell",
    tone: toneOk,
    center: !!center,
  });
  if (persist) return;
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
