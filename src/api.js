import { isPbMode } from "./pb/client.js";
import * as bridge from "./engine/apiBridge.js";
import { bridgeGetFileBytes } from "./engine/apiBridge.js";
import {
  PaywallAbortError,
  shouldBlockStorageUpload,
  totalUserStorageBytes,
} from "./billingLimits.js";
import { askPaywall } from "./paywallDialog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Decoded byte length of a base64 payload (padding-aware). */
function base64DecodedBytes(data) {
  if (typeof data !== "string" || !data) return 0;
  const len = data.length;
  if (!len) return 0;
  const pad = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - pad);
}

async function assertStorageAllowsUpload(body) {
  if (!isPbMode()) return;
  const { engine } = bridge;
  const pending = engine.listPendingAttachmentLists();
  const used = totalUserStorageBytes({
    workspace: engine.getWorkspaceDoc(),
    archive: engine.getArchiveDoc(),
    pendingFiles: pending.pendingFiles,
    pendingImages: pending.pendingImages,
  });
  const incoming = base64DecodedBytes(body?.data);
  if (!shouldBlockStorageUpload(used, incoming)) return;
  await askPaywall({ highlightFree: "200 MB" });
  throw new PaywallAbortError();
}

async function apiJson(path, { method = "GET", body } = {}) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = JSON_HEADERS;
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

async function apiData(path, opts) {
  const { data } = await apiJson(path, opts);
  return data;
}

async function apiOkData(path, opts, fallbackMsg) {
  const { r, data } = await apiJson(path, opts);
  if (!r.ok) throw new Error(data?.error || fallbackMsg);
  return data;
}

export async function fetchWorkspace() {
  if (isPbMode()) return bridge.bridgeFetchWorkspace();
  return apiData("/api/workspace");
}

export async function fetchArchivedProjects() {
  if (isPbMode()) {
    const list = await bridge.bridgeFetchArchived();
    return Array.isArray(list) ? list : list?.projects || [];
  }
  const data = await apiData("/api/archived-projects");
  return data.projects || [];
}

export async function putCard(body) {
  if (isPbMode()) return bridge.bridgePutCard(body);
  return apiData("/api/card", { method: "PUT", body });
}

export async function putCardOrder(body) {
  if (isPbMode()) return bridge.bridgePutCardOrder(body);
  return apiData("/api/card-order", { method: "PUT", body });
}

export async function deleteCardApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteCard(body);
  return apiData("/api/card", { method: "DELETE", body });
}

export async function fetchTrash() {
  if (isPbMode()) {
    const data = await bridge.bridgeFetchTrash();
    return data.trash || data;
  }
  const data = await apiData("/api/trash");
  return data.trash;
}

export async function restoreTrashApi(body) {
  if (isPbMode()) return bridge.bridgeRestoreTrash(body);
  const { r, data } = await apiJson("/api/trash/restore", { method: "POST", body });
  if (!r.ok) throw new Error(data?.error || "restore failed");
  return data;
}

export async function postCard(body) {
  if (isPbMode()) return bridge.bridgePostCard(body);
  return apiData("/api/card", { method: "POST", body });
}

export async function putProject(body) {
  if (isPbMode()) return bridge.bridgePutProject(body);
  return apiData("/api/project", { method: "PUT", body });
}

export async function postProject(body) {
  if (isPbMode()) return bridge.bridgePostProject(body);
  const { r, data } = await apiJson("/api/project", { method: "POST", body });
  if (!r.ok) throw new Error(data?.error || "create failed");
  return data;
}

export async function deleteProjectApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteProject(body);
  return apiData("/api/project", { method: "DELETE", body });
}

export async function putProjectOrder(body) {
  if (isPbMode()) return bridge.bridgePutProjectOrder(body);
  return apiData("/api/project-order", { method: "PUT", body });
}

export async function putBoard(body) {
  if (isPbMode()) return bridge.bridgePutBoard(body);
  return apiData("/api/board", { method: "PUT", body });
}

export async function postBoard(body) {
  if (isPbMode()) return bridge.bridgePostBoard(body);
  return apiData("/api/board", { method: "POST", body });
}

export async function putMasterboard(body) {
  if (isPbMode()) return bridge.bridgePutMasterboard(body);
  return apiData("/api/masterboard", { method: "PUT", body });
}

export async function fetchTimelogs() {
  if (isPbMode()) return bridge.bridgeFetchTimelogs();
  const data = await apiData("/api/timelogs");
  return data.timelogs || data;
}

export async function postTimelog(body) {
  if (isPbMode()) return bridge.bridgePostTimelog(body);
  return apiData("/api/timelog", { method: "POST", body });
}

export async function putTimelog(body) {
  if (isPbMode()) return bridge.bridgePutTimelog(body);
  const { r, data } = await apiJson("/api/timelog", { method: "PUT", body });
  if (!r.ok) throw new Error(data?.error || "update failed");
  return data;
}

export async function deleteTimelogApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteTimelog(body);
  const { r, data } = await apiJson("/api/timelog", { method: "DELETE", body });
  if (!r.ok) throw new Error(data?.error || "delete failed");
  return data;
}

export async function putItem(body) {
  if (isPbMode()) return bridge.bridgePutItem(body);
  return apiData("/api/item", { method: "PUT", body });
}

export async function postItem(body) {
  if (isPbMode()) return bridge.bridgePostItem(body);
  return apiData("/api/item", { method: "POST", body });
}

export async function deleteItemApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteItem(body);
  return apiData("/api/item", { method: "DELETE", body });
}

export async function putDatabase(body) {
  if (isPbMode()) return bridge.bridgePutDatabase(body);
  await fetch("/api/database", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return fetchWorkspace();
}

export async function postDatabase(body) {
  if (isPbMode()) return bridge.bridgePostDatabase(body);
  return apiData("/api/database", { method: "POST", body });
}

export async function postNotesTab(body) {
  if (isPbMode()) return bridge.bridgePostNotesTab(body);
  return apiData("/api/notes-tab", { method: "POST", body });
}

export async function postFilesTab(body) {
  if (isPbMode()) return bridge.bridgePostFilesTab(body);
  return apiData("/api/files-tab", { method: "POST", body });
}

export async function postFile(body) {
  if (isPbMode()) {
    await assertStorageAllowsUpload(body);
    return bridge.bridgePostFile(body);
  }
  return apiOkData("/api/file", { method: "POST", body }, "Could not upload file");
}

export async function postCardFile(body) {
  if (isPbMode()) {
    await assertStorageAllowsUpload(body);
    return bridge.bridgePostCardFile(body);
  }
  return apiOkData("/api/card-file", { method: "POST", body }, "Could not upload file");
}

export async function postRteImage(body) {
  if (isPbMode()) {
    await assertStorageAllowsUpload(body);
    return bridge.bridgePostRteImage(body);
  }
  return apiOkData("/api/rte-image", { method: "POST", body }, "Could not upload image");
}

export async function deleteRteImageApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteRteImage(body);
  return apiOkData("/api/rte-image", { method: "DELETE", body }, "Could not delete image");
}

/** scope: "note" | "cover" | "card". note → notesTab+note; card → board+card. */
export function rteImageUrl({ scope, project, notesTab, note, board, card, file }) {
  if (isPbMode()) {
    const { COVER_TAB_ID } = bridge;
    const tab =
      scope === "note" ? notesTab : scope === "card" ? board : COVER_TAB_ID;
    return `pb-blob://${project}/${tab}/${file}`;
  }
  const q = new URLSearchParams({ scope, project, file });
  if (scope === "note") {
    q.set("notesTab", notesTab);
    q.set("note", note);
  } else if (scope === "card") {
    q.set("board", board);
    q.set("card", card);
  }
  return `/api/rte-image?${q.toString()}`;
}

export async function deleteCardFileApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteCardFile(body);
  return apiOkData("/api/card-file", { method: "DELETE", body }, "Could not delete file");
}

export function cardFileDownloadUrl(project, board, card, file) {
  if (isPbMode()) return `pb-blob://${project}/${board}/${file}`;
  const q = new URLSearchParams({ project, board, card, file });
  return `/api/card-file?${q.toString()}`;
}

export async function moveCardFilesApi(body) {
  if (isPbMode()) return bridge.bridgeMoveCardFiles(body);
  return apiOkData(
    "/api/card-file/move",
    { method: "POST", body },
    "Could not move files"
  );
}

export async function putFile(body) {
  if (isPbMode()) return bridge.bridgePutFile(body);
  return apiOkData("/api/file", { method: "PUT", body }, "Could not rename file");
}

export async function deleteFileApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteFile(body);
  return apiData("/api/file", { method: "DELETE", body });
}

export function fileDownloadUrl(project, filesTab, file) {
  if (isPbMode()) return `pb-blob://${project}/${filesTab}/${file}`;
  const q = new URLSearchParams({ project, filesTab, file });
  return `/api/file?${q.toString()}`;
}

/** Fetch a files/card/blob URL and trigger a named browser download. */
export async function downloadNamedFile(url, filename) {
  let fetchUrl = url;
  if (String(url).startsWith("pb-blob://")) {
    fetchUrl = await resolvePbBlobUrl(url);
    if (!fetchUrl || fetchUrl === url) throw new Error("Could not download file");
  }
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error("Could not download file");
  const blob = await res.blob();
  const { downloadBlob } = await import("./utils.js");
  downloadBlob(filename || "download", blob);
}

export async function moveFileApi(body) {
  if (isPbMode()) return bridge.bridgeMoveFile(body);
  return apiOkData("/api/file/move", { method: "POST", body }, "Could not move file");
}

export async function putTab(body) {
  if (isPbMode()) return bridge.bridgePutTab(body);
  return apiData("/api/tab", { method: "PUT", body });
}

export async function deleteTabApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteTab(body);
  return apiData("/api/tab", { method: "DELETE", body });
}

export async function putTabOrder(body) {
  if (isPbMode()) return bridge.bridgePutTabOrder(body);
  return apiData("/api/tab-order", { method: "PUT", body });
}

export async function postNote(body) {
  if (isPbMode()) return bridge.bridgePostNote(body);
  return apiData("/api/note", { method: "POST", body });
}

export async function putNote(body) {
  if (isPbMode()) return bridge.bridgePutNote(body);
  return apiData("/api/note", { method: "PUT", body });
}

export async function deleteNoteApi(body) {
  if (isPbMode()) return bridge.bridgeDeleteNote(body);
  return apiData("/api/note", { method: "DELETE", body });
}

export async function moveNoteApi(body) {
  if (isPbMode()) return bridge.bridgeMoveNote(body);
  return apiOkData("/api/note/move", { method: "POST", body }, "Could not move note");
}

export async function fetchCardTimelogs(project, board, card) {
  if (!project || !board || !card) return [];
  try {
    const entries = await fetchTimelogs();
    return entries
      .filter((e) => e.project === project && e.board === board && e.card === card)
      .sort((a, b) =>
        String(b.endedAt || b.startedAt || "").localeCompare(
          String(a.endedAt || a.startedAt || "")
        )
      );
  } catch {
    return [];
  }
}

export async function cardTimeSpentSec(project, board, card) {
  const entries = await fetchCardTimelogs(project, board, card);
  return entries.reduce((sum, e) => sum + (e.durationSec || 0), 0);
}

export async function exportWorkspace() {
  if (isPbMode()) {
    const JSZip = (await import("jszip")).default;
    const { engine } = await import("./engine/apiBridge.js");
    const zip = new JSZip();
    const data = {
      workspace: engine.getWorkspaceDoc(),
      archive: engine.getArchiveDoc(),
    };
    zip.file("userWorkspace.json", JSON.stringify(data.workspace, null, 2) + "\n");
    zip.file("userArchive.json", JSON.stringify(data.archive, null, 2) + "\n");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-binder-backup.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const r = await fetch("/api/export");
  if (!r.ok) throw new Error("export failed");
  const blob = await r.blob();
  const cd = r.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match ? match[1] : "project-binder-backup.zip";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Parse `userWorkspace.json` from a backup zip without applying it. */
export async function peekBackupWorkspace(file) {
  if (!file) throw new Error("Choose a backup zip");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const wsText = await zip.file("userWorkspace.json")?.async("string");
  if (!wsText) throw new Error("backup missing userWorkspace.json");
  return JSON.parse(wsText);
}

export async function importBackup(body) {
  if (!isPbMode()) throw new Error("Import requires PocketBase");
  const file = body?.file;
  if (!file) throw new Error("Choose a backup zip");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const wsText = await zip.file("userWorkspace.json")?.async("string");
  if (!wsText) throw new Error("backup missing userWorkspace.json");
  const archText = await zip.file("userArchive.json")?.async("string");
  const { engine } = await import("./engine/apiBridge.js");
  engine.loadFromWorkspaceDoc(JSON.parse(wsText));
  if (archText) engine.loadFromArchiveDoc(JSON.parse(archText));
  else engine.loadFromArchiveDoc({ version: 2, projects: [] });
  const { flushPersist } = await import("./engine/apiBridge.js");
  await flushPersist();
  return engine.getWorkspace();
}

export async function resetWorkspaceToSeed() {
  if (isPbMode()) {
    const res = await fetch("/seedWorkspace.json");
    if (!res.ok) throw new Error("Could not load seedWorkspace.json");
    return bridge.bridgeResetSeed(await res.json());
  }
  const r = await fetch("/api/workspace/reset-seed", { method: "POST" });
  if (!r.ok) throw new Error("reset failed");
  return r.json();
}

export async function resetWorkspaceToEmpty() {
  if (isPbMode()) return bridge.bridgeResetEmpty();
  const r = await fetch("/api/workspace/reset-empty", { method: "POST" });
  if (!r.ok) throw new Error("reset failed");
  return r.json();
}

/** Resolve pb-blob:// URLs to object URLs for <img> / downloads. */
export async function resolvePbBlobUrl(url) {
  if (!url || !String(url).startsWith("pb-blob://")) return url;
  const path = String(url).slice("pb-blob://".length);
  const [project, tab, file] = path.split("/");
  const { getShareGuestContext } = await import("./pb/shareGuest.js");
  const guest = getShareGuestContext();
  if (guest?.fileMap) {
    const { attachmentKey } = await import("./pb/persist.js");
    const { downloadShareFile } = await import("./pb/shares.js");
    const key = attachmentKey(project, tab, file);
    const shareFileId = guest.fileMap[key];
    if (shareFileId) {
      const blob = await downloadShareFile(shareFileId);
      if (blob) return URL.createObjectURL(blob);
    }
    return url;
  }
  const bytes = await bridgeGetFileBytes(project, tab, file);
  if (!bytes) return url;
  return URL.createObjectURL(new Blob([bytes]));
}

export async function enableProjectShare(projectId) {
  const { workspaceEngine } = await import("./engine/workspaceEngine.js");
  const { ensureShareRecord, syncSharePayload, sharePublicUrl } = await import(
    "./pb/shares.js"
  );
  const meta = workspaceEngine.peekShareMeta(projectId, null);
  const { id } = await ensureShareRecord({
    shareId: meta.shareId,
    scope: "project",
    projectId,
    tabId: "",
    enabled: true,
  });
  await syncSharePayload(
    id,
    workspaceEngine.getWorkspace(),
    { scope: "project", projectId, tabId: "" },
    { enabled: true }
  );
  workspaceEngine.setShareMeta(projectId, null, {
    shareId: id,
    shareEnabled: true,
  });
  return { shareId: id, url: sharePublicUrl(id) };
}

export async function enableTabShare(projectId, tabId) {
  const { workspaceEngine } = await import("./engine/workspaceEngine.js");
  const { ensureShareRecord, syncSharePayload, sharePublicUrl } = await import(
    "./pb/shares.js"
  );
  const meta = workspaceEngine.peekShareMeta(projectId, tabId);
  const { id } = await ensureShareRecord({
    shareId: meta.shareId,
    scope: "tab",
    projectId,
    tabId,
    enabled: true,
  });
  await syncSharePayload(
    id,
    workspaceEngine.getWorkspace(),
    { scope: "tab", projectId, tabId },
    { enabled: true }
  );
  workspaceEngine.setShareMeta(projectId, tabId, {
    shareId: id,
    shareEnabled: true,
  });
  return { shareId: id, url: sharePublicUrl(id) };
}

export async function disableShare(projectId, tabId) {
  const { workspaceEngine } = await import("./engine/workspaceEngine.js");
  const { setShareEnabled, sharePublicUrl } = await import("./pb/shares.js");
  const meta = workspaceEngine.peekShareMeta(projectId, tabId || null);
  if (!meta.shareId) return { shareId: null, url: "" };
  await setShareEnabled(meta.shareId, false);
  workspaceEngine.setShareMeta(projectId, tabId || null, {
    shareId: meta.shareId,
    shareEnabled: false,
  });
  return { shareId: meta.shareId, url: sharePublicUrl(meta.shareId) };
}

export function getShareLink(projectId, tabId) {
  const meta = bridge.engine.peekShareMeta(projectId, tabId || null);
  if (!meta.shareId) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/${meta.shareId}`;
}
