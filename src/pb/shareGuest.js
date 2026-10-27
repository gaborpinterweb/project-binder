/** Guest share viewing context (fileMap from payload). */

let guestCtx = null;

/** @param {{ shareId: string, fileMap: Record<string, string> } | null} ctx */
export function setShareGuestContext(ctx) {
  guestCtx = ctx;
}

export function getShareGuestContext() {
  return guestCtx;
}

export function isShareGuestMode() {
  return !!guestCtx?.shareId;
}
