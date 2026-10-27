import { isCommercialMode, isProUser } from "./pb/client.js";
import { isProjectArchived } from "./utils.js";

export const FREE_ACTIVE_PROJECT_LIMIT = 3;
export const FREE_STORAGE_BYTES = 200 * 1024 * 1024;

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

/** Match persist.js jsonFile: pretty JSON + trailing newline, UTF-8 bytes. */
export function jsonDocByteLength(obj) {
  if (obj == null) return 0;
  const text = JSON.stringify(obj, null, 2) + "\n";
  return new TextEncoder().encode(text).length;
}

function sumFileMetaList(files) {
  if (!Array.isArray(files)) return 0;
  let total = 0;
  for (const f of files) {
    total += Number(f?.size) || 0;
  }
  return total;
}

/** Attachment bytes referenced by one project doc (active or archived shape). */
export function sumAttachmentBytesFromProject(project) {
  if (!project || typeof project !== "object") return 0;
  let total = sumFileMetaList(project.coverImages);
  for (const b of project.boards || []) {
    for (const c of b.cards || []) {
      total += sumFileMetaList(c.files);
      total += sumFileMetaList(c.images);
    }
  }
  for (const t of project.notesTabs || []) {
    for (const n of t.notes || []) {
      total += sumFileMetaList(n.images);
    }
  }
  for (const t of project.filesTabs || []) {
    total += sumFileMetaList(t.files);
  }
  return total;
}

function sumAttachmentBytesFromDoc(doc) {
  if (!doc || typeof doc !== "object") return 0;
  let total = 0;
  for (const p of doc.projects || []) {
    total += sumAttachmentBytesFromProject(p);
  }
  return total;
}

function sumPendingLists(lists) {
  if (!Array.isArray(lists)) return 0;
  let total = 0;
  for (const list of lists) {
    total += sumFileMetaList(list);
  }
  return total;
}

/**
 * Total user storage: persisted JSON docs + all attachment sizes + pending drafts.
 * @param {{
 *   workspace?: object,
 *   archive?: object,
 *   pendingFiles?: unknown[],
 *   pendingImages?: unknown[],
 * }} parts
 */
export function totalUserStorageBytes(parts = {}) {
  const workspace = parts.workspace;
  const archive = parts.archive;
  return (
    jsonDocByteLength(workspace) +
    jsonDocByteLength(archive) +
    sumAttachmentBytesFromDoc(workspace) +
    sumAttachmentBytesFromDoc(archive) +
    sumPendingLists(parts.pendingFiles) +
    sumPendingLists(parts.pendingImages)
  );
}

/**
 * Commercial Free users cannot upload when used + incoming would exceed 200 MB.
 * Community builds and Pro users are never blocked.
 */
export function shouldBlockStorageUpload(usedBytes, incomingBytes) {
  if (!isCommercialMode() || isProUser()) return false;
  const used = Number(usedBytes) || 0;
  const incoming = Number(incomingBytes) || 0;
  return used + incoming > FREE_STORAGE_BYTES;
}

/** Thrown after the paywall closes so upload callers abort without a second alert. */
export class PaywallAbortError extends Error {
  constructor() {
    super("");
    this.name = "PaywallAbortError";
  }
}

export function isPaywallAbortError(err) {
  return !!err && err.name === "PaywallAbortError";
}
