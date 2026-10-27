import { isCommercialMode, isProUser } from "./pb/client.js";
import { isProjectArchived } from "./utils.js";

export const FREE_ACTIVE_PROJECT_LIMIT = 3;

/** Active (non-archived) projects in the live binder. */
export function activeProjectCount(folders) {
  if (!Array.isArray(folders)) return 0;
  return folders.filter((f) => !isProjectArchived(f)).length;
}

/**
 * Commercial Free users at or over the active-project cap cannot add/reactivate.
 * Community builds and Pro users are never blocked.
 */
export function shouldBlockNewActiveProject(folders) {
  if (!isCommercialMode() || isProUser()) return false;
  return activeProjectCount(folders) >= FREE_ACTIVE_PROJECT_LIMIT;
}

/**
 * Commercial Free users cannot enable public read-only share links.
 * Community builds and Pro users are never blocked.
 */
export function shouldBlockPublicShare() {
  return isCommercialMode() && !isProUser();
}
