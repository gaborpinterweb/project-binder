let setSyncingState = null;

export function bindSyncingHost(setter) {
  setSyncingState = setter;
}

export function setSyncingVisible(visible) {
  setSyncingState?.(!!visible);
}
