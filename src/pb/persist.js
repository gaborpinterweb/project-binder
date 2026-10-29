/** Load/save userWorkspace + userArchive file fields on user_data. */

import { getPb } from "./client.js";

const COLLECTION = "user_data";
const WS_FIELD = "userWorkspace";
const ARCH_FIELD = "userArchive";

function jsonFile(name, obj) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  return new File([text], name, { type: "application/json" });
}

/**
 * @returns {Promise<
 *   | { status: "empty" }
 *   | { status: "ok", data: unknown }
 *   | { status: "error", error: Error }
 * >}
 */
async function parseJsonFile(pb, record, field) {
  const name = record?.[field];
  if (!name) return { status: "empty" };
  const url = pb.files.getURL(record, name);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return {
      status: "error",
      error: new Error(
        `Could not load ${field}: ${err?.message || "network error"}`
      ),
    };
  }
  if (!res.ok) {
    return {
      status: "error",
      error: new Error(`Could not load ${field} (HTTP ${res.status})`),
    };
  }
  try {
    return { status: "ok", data: await res.json() };
  } catch (err) {
    return {
      status: "error",
      error: new Error(
        `Could not parse ${field}: ${err?.message || "invalid JSON"}`
      ),
    };
  }
}

function unwrapDoc(result) {
  if (result.status === "error") throw result.error;
  if (result.status === "empty") return null;
  return result.data;
}

export async function ensureUserDataRecord() {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) throw new Error("not authenticated");
  const existing = await pb.collection(COLLECTION).getList(1, 1, {
    filter: `user = "${uid}"`,
  });
  if (existing.items[0]) return existing.items[0];
  return pb.collection(COLLECTION).create({ user: uid });
}

export async function loadUserDocs() {
  const pb = getPb();
  const record = await ensureUserDataRecord();
  const workspace = unwrapDoc(await parseJsonFile(pb, record, WS_FIELD));
  const archive = unwrapDoc(await parseJsonFile(pb, record, ARCH_FIELD));
  return { record, workspace, archive };
}

export async function saveUserDocs({ workspace, archive }) {
  const pb = getPb();
  const record = await ensureUserDataRecord();
  const fd = new FormData();
  if (workspace != null) {
    fd.append(WS_FIELD, jsonFile("userWorkspace.json", workspace));
  }
  if (archive != null) {
    fd.append(ARCH_FIELD, jsonFile("userArchive.json", archive));
  }
  return pb.collection(COLLECTION).update(record.id, fd);
}

/** Attachment key: project/tab/fileId (matches legacy upload paths). */
export function attachmentKey(projectId, tabId, fileId) {
  return `${projectId}/${tabId}/${fileId}`;
}

export async function uploadAttachment(key, blob, filename = "file") {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) throw new Error("not authenticated");
  const list = await pb.collection("attachments").getList(1, 1, {
    filter: `user = "${uid}" && key = "${key.replace(/"/g, '\\"')}"`,
  });
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, {
          type: blob.type || "application/octet-stream",
        });
  const fd = new FormData();
  fd.append("file", file);
  try {
    if (list.items[0]) {
      return await pb.collection("attachments").update(list.items[0].id, fd);
    }
    fd.append("user", uid);
    fd.append("key", key);
    return await pb.collection("attachments").create(fd);
  } catch (err) {
    const detail =
      err?.response?.message ||
      err?.data?.message ||
      err?.message ||
      "Could not upload attachment";
    throw new Error(detail);
  }
}

export async function downloadAttachment(key) {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) throw new Error("not authenticated");
  const list = await pb.collection("attachments").getList(1, 1, {
    filter: `user = "${uid}" && key = "${key.replace(/"/g, '\\"')}"`,
  });
  const rec = list.items[0];
  if (!rec?.file) return null;
  const url = pb.files.getURL(rec, rec.file);
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.blob();
}

export async function deleteAttachment(key) {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) return;
  const list = await pb.collection("attachments").getList(1, 1, {
    filter: `user = "${uid}" && key = "${key.replace(/"/g, '\\"')}"`,
  });
  if (list.items[0]) {
    await pb.collection("attachments").delete(list.items[0].id);
  }
}

export async function listAttachmentKeys() {
  const pb = getPb();
  const uid = pb.authStore.record?.id;
  if (!uid) return [];
  const rows = await pb.collection("attachments").getFullList({
    filter: `user = "${uid}"`,
    fields: "key",
  });
  return rows.map((r) => r.key);
}
