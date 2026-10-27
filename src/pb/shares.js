/** PocketBase shares + share_files CRUD and sync. */

import { getPb } from "./client.js";
import { attachmentKey, downloadAttachment } from "./persist.js";
import { buildShareSnapshot } from "./shareSnapshot.js";

const SHARES = "shares";
const SHARE_FILES = "share_files";

function jsonFile(name, obj) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  return new File([text], name, { type: "application/json" });
}

function esc(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function sharePublicUrl(shareId) {
  if (!shareId || typeof window === "undefined") return "";
  return `${window.location.origin}/share/${shareId}`;
}

export async function getShareRecord(shareId) {
  const pb = getPb();
  return pb.collection(SHARES).getOne(shareId);
}

/** Guest-safe: fails when disabled or missing. */
export async function fetchPublicShare(shareId) {
  const pb = getPb();
  const record = await pb.collection(SHARES).getOne(shareId);
  const name = record?.payload;
  if (!name) throw new Error("Share has no payload");
  const url = pb.files.getURL(record, name);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load share payload");
  const payload = await res.json();
  return { record, payload };
}

export async function downloadShareFile(shareFileId) {
  const pb = getPb();
  const rec = await pb.collection(SHARE_FILES).getOne(shareFileId);
  if (!rec?.file) return null;
  const url = pb.files.getURL(rec, rec.file);
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.blob();
}

async function listShareFiles(shareId) {
  const pb = getPb();
  return pb.collection(SHARE_FILES).getFullList({
    filter: `share = "${esc(shareId)}"`,
  });
}

async function upsertShareFile({ uid, shareId, key, blob, enabled }) {
  const pb = getPb();
  const existing = await pb.collection(SHARE_FILES).getList(1, 1, {
    filter: `share = "${esc(shareId)}" && key = "${esc(key)}"`,
  });
  const filename = key.split("/").pop() || "file";
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, {
          type: blob.type || "application/octet-stream",
        });
  const fd = new FormData();
  fd.append("file", file);
  fd.append("enabled", enabled ? "true" : "false");
  if (existing.items[0]) {
    return pb.collection(SHARE_FILES).update(existing.items[0].id, fd);
  }
  fd.append("user", uid);
  fd.append("share", shareId);
  fd.append("key", key);
  return pb.collection(SHARE_FILES).create(fd);
}

async function setShareFilesEnabled(shareId, enabled) {
  const rows = await listShareFiles(shareId);
  const pb = getPb();
  await Promise.all(
    rows.map((row) =>
      pb.collection(SHARE_FILES).update(row.id, { enabled: !!enabled })
    )
  );
}

/**
 * Create share once, or return existing id from meta.
 * @returns {Promise<{ id: string, created: boolean }>}
 */
export async function ensureShareRecord({
  shareId,
  scope,
  projectId,
  tabId = "",
  enabled = true,
}) {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) throw new Error("not authenticated");

  if (shareId) {
    try {
      const existing = await pb.collection(SHARES).getOne(shareId);
      return { id: existing.id, created: false };
    } catch {
      /* recreate below */
    }
  }

  const record = await pb.collection(SHARES).create({
    user: uid,
    enabled: !!enabled,
    scope,
    projectId,
    tabId: tabId || "",
  });
  return { id: record.id, created: true };
}

export async function setShareEnabled(shareId, enabled) {
  const pb = getPb();
  await pb.collection(SHARES).update(shareId, { enabled: !!enabled });
  await setShareFilesEnabled(shareId, enabled);
}

export async function deleteShareRecord(shareId) {
  if (!shareId) return;
  const pb = getPb();
  try {
    await pb.collection(SHARES).delete(shareId);
  } catch {
    /* already gone */
  }
}

/**
 * Upload snapshot JSON + copy referenced attachments into share_files.
 * Payload includes `fileMap`: attachmentKey → share_files record id.
 */
export async function syncSharePayload(shareId, workspaceApi, target, { enabled = true } = {}) {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) throw new Error("not authenticated");

  const { workspace, keys } = buildShareSnapshot(workspaceApi, target);
  const keyList = [...keys];
  const fileMap = {};

  const existing = await listShareFiles(shareId);
  const existingByKey = new Map(existing.map((r) => [r.key, r]));

  for (const key of keyList) {
    try {
      const blob = await downloadAttachment(key);
      if (!blob) continue;
      const rec = await upsertShareFile({
        uid,
        shareId,
        key,
        blob,
        enabled: !!enabled,
      });
      fileMap[key] = rec.id;
      existingByKey.delete(key);
    } catch (err) {
      console.warn("share file sync failed", key, err);
    }
  }

  for (const orphan of existingByKey.values()) {
    try {
      await pb.collection(SHARE_FILES).delete(orphan.id);
    } catch {
      /* ignore */
    }
  }

  workspace.fileMap = fileMap;

  // JSON for fields; FormData only for the file (avoids PB bool/text FormData quirks).
  await pb.collection(SHARES).update(shareId, {
    enabled: !!enabled,
    scope: target.scope,
    projectId: target.projectId,
    tabId: target.tabId || "",
  });
  const fd = new FormData();
  fd.append("payload", jsonFile("payload.json", workspace));
  return pb.collection(SHARES).update(shareId, fd);
}

/**
 * Sync all enabled shares from workspace meta list.
 * @param {object} workspaceApi
 * @param {Array<{ shareId: string, scope: string, projectId: string, tabId?: string }>} targets
 */
export async function syncEnabledShares(workspaceApi, targets) {
  if (!targets?.length) return;
  for (const t of targets) {
    if (!t.shareId) continue;
    try {
      await syncSharePayload(t.shareId, workspaceApi, {
        scope: t.scope,
        projectId: t.projectId,
        tabId: t.tabId || "",
      }, { enabled: true });
    } catch (err) {
      console.error("share sync failed", t.shareId, err);
      throw err;
    }
  }
}

export { attachmentKey };
