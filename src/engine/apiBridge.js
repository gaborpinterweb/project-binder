/**
 * Maps src/api.js calls onto workspaceEngine + PB file persist.
 */
import { workspaceEngine as eng, COVER_TAB_ID } from "./workspaceEngine.js";
import { fileBlobStore, blobKey } from "./fileBlobStore.js";
import { isPbMode } from "../pb/client.js";
import {
  saveUserDocs,
  loadUserDocs,
  fetchUserDataMeta,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  attachmentKey,
} from "../pb/persist.js";
import { installSeedDemoAttachments } from "../seedDemoFiles.js";
import { deleteShareRecord, syncEnabledShares } from "../pb/shares.js";
import { showSnackbar } from "../snackbar.js";
import { setSyncingVisible } from "../syncingDialog.js";

let persistTimer = null;
let persistChain = Promise.resolve();
let persistHooked = false;
let pullTimer = null;
let focusPullBound = false;

/** changeId of the last loaded or successfully saved remote docs. */
let localBaseChangeId = "";
/** True after local mutations until a successful save or remote-wins adopt. */
let dirty = false;
/** True while blocking conflict recovery is running. */
let syncing = false;
/** Bumped when local edits start so in-flight quiet pulls abort. */
let pullGeneration = 0;
/** When true, quiet/focus pulls no-op (conflict e2e forces the Syncing path). */
let backgroundPullPaused = false;

let onWorkspaceReplaced = null;

export function setBackgroundPullPaused(paused) {
  backgroundPullPaused = !!paused;
}

export function setLocalBaseChangeId(id) {
  localBaseChangeId = id ? String(id) : "";
}

export function getLocalBaseChangeId() {
  return localBaseChangeId;
}

/** App registers to re-apply engine workspace after a remote pull. */
export function bindWorkspaceReplaced(fn) {
  onWorkspaceReplaced = typeof fn === "function" ? fn : null;
}

function notifyWorkspaceReplaced() {
  onWorkspaceReplaced?.(eng.getWorkspace());
}

function remoteIsNewer(remoteChangeId) {
  const remote = remoteChangeId ? String(remoteChangeId) : "";
  if (!remote || !localBaseChangeId) return false;
  return remote !== localBaseChangeId;
}

/**
 * Replace in-memory docs with remote. Remote wins; discards local dirty state.
 * @param {{ blocking?: boolean }} [opts]
 */
async function adoptRemoteDocs({ blocking = false } = {}) {
  if (blocking) {
    syncing = true;
    setSyncingVisible(true);
    // Yield so React can paint the non-dismissible Syncing overlay.
    await new Promise((r) => setTimeout(r, 0));
  }
  try {
    clearTimeout(persistTimer);
    persistTimer = null;
    const { workspace, archive, changeId } = await loadUserDocs();
    if (workspace && Number(workspace.version) >= 2) {
      eng.loadFromWorkspaceDoc(workspace);
      eng.loadFromArchiveDoc(archive || { version: 2, projects: [] });
    } else {
      throw new Error("Remote workspace is missing or unsupported");
    }
    localBaseChangeId = changeId || "";
    dirty = false;
    notifyWorkspaceReplaced();
  } finally {
    if (blocking) {
      syncing = false;
      setSyncingVisible(false);
    }
  }
}

async function persistWorkspaceAndShares() {
  if (!isPbMode() || syncing) return;

  const meta = await fetchUserDataMeta();
  if (remoteIsNewer(meta.changeId)) {
    await adoptRemoteDocs({ blocking: true });
    return;
  }

  const newChangeId = crypto.randomUUID();
  const { workspace, archive } = eng.exportWorkspaceData();
  await saveUserDocs({ workspace, archive, changeId: newChangeId });
  localBaseChangeId = newChangeId;
  dirty = false;

  const targets = eng.listEnabledShares();
  if (!targets.length) return;
  try {
    await syncEnabledShares(eng.getWorkspace(), targets);
  } catch (err) {
    console.error("share sync failed", err);
    showSnackbar({
      icon: "bell",
      tone: "error",
      message: "Could not update shared link",
      durationMs: 5000,
    });
  }
}

export function schedulePersist() {
  if (!isPbMode()) return;
  dirty = true;
  pullGeneration += 1;
  // Local edits win over a pending quiet pull (avoid adopting mid-type).
  clearTimeout(pullTimer);
  pullTimer = null;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistChain = persistChain
      .then(() => persistWorkspaceAndShares())
      .catch((err) => console.error("persist failed", err));
  }, 400);
}

export function ensurePersistHook() {
  if (persistHooked) return;
  persistHooked = true;
  eng.setOnChange(() => {
    dirty = true;
    schedulePersist();
  });
}

/** Non-blocking pull when remote changeId advanced and local is clean. */
export async function pullRemoteIfChanged() {
  if (!isPbMode() || syncing || dirty || backgroundPullPaused) return;
  const gen = pullGeneration;
  try {
    const meta = await fetchUserDataMeta();
    // Re-check after await: a local edit may have started during the fetch.
    if (gen !== pullGeneration || syncing || dirty || backgroundPullPaused) return;
    if (!remoteIsNewer(meta.changeId)) return;
    if (gen !== pullGeneration || dirty || backgroundPullPaused) return;
    await adoptRemoteDocs({ blocking: false });
  } catch (err) {
    console.error("background pull failed", err);
  }
}

export function scheduleBackgroundPull() {
  if (!isPbMode()) return;
  clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    pullRemoteIfChanged().catch((err) =>
      console.error("background pull failed", err)
    );
  }, 1000);
}

/** visibilitychange + focus → debounced background pull (once per session). */
export function ensureFocusPullListeners() {
  if (!isPbMode() || focusPullBound || typeof window === "undefined") return;
  focusPullBound = true;
  const onVis = () => {
    if (document.visibilityState === "visible") scheduleBackgroundPull();
  };
  const onFocus = () => scheduleBackgroundPull();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onFocus);
  // E2E / programmatic pull without relying on headless focus.
  window.addEventListener("pb:pull-workspace", () => {
    void pullRemoteIfChanged();
  });
  window.__pbPullRemoteIfChanged = pullRemoteIfChanged;
  window.__pbSetBackgroundPullPaused = setBackgroundPullPaused;
  window.__pbSyncDebug = () => ({
    localBaseChangeId,
    dirty,
    syncing,
    backgroundPullPaused,
  });
}

async function flushPersist() {
  clearTimeout(persistTimer);
  await persistChain;
  if (isPbMode()) {
    dirty = true;
    await persistWorkspaceAndShares();
  }
}

function after(result) {
  schedulePersist();
  return result;
}

async function syncAttachmentUp(project, tab, fileId, mime, name) {
  if (!isPbMode()) return;
  const bytes = eng.getFileBlob(project, tab, fileId);
  if (!bytes) return;
  await uploadAttachment(
    attachmentKey(project, tab, fileId),
    new Blob([bytes], { type: mime || "application/octet-stream" }),
    name || fileId
  );
}

async function syncAttachmentDown(project, tab, fileId) {
  if (!isPbMode()) return null;
  const blob = await downloadAttachment(attachmentKey(project, tab, fileId));
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  eng.setFileBlob(project, tab, fileId, bytes);
  return bytes;
}

export async function bridgeFetchWorkspace() {
  return eng.getWorkspace();
}

export async function bridgeFetchArchived() {
  return eng.getArchivedProjects();
}

export async function bridgePutCard(body) {
  return after(await eng.putCard(body));
}

export async function bridgePostCard(body) {
  return after(await eng.postCard(body));
}

export async function bridgeDeleteCard(body) {
  return after(await eng.deleteCardApi(body));
}

export async function bridgePutCardOrder(body) {
  return after(await eng.putCardOrder(body));
}

export async function bridgePutProject(body) {
  return after(await eng.putProject(body));
}

export async function bridgePostProject(body) {
  const result = await eng.postProject(body);
  schedulePersist();
  return result;
}

export async function bridgeDeleteProject(body) {
  const data = await eng.deleteProjectApi(body);
  if (isPbMode() && Array.isArray(data?.shareIds)) {
    for (const id of data.shareIds) {
      await deleteShareRecord(id);
    }
  }
  return after(data);
}

export async function bridgePutProjectOrder(body) {
  return after(await eng.putProjectOrder(body));
}

export async function bridgePutBoard(body) {
  return after(await eng.putBoard(body));
}

export async function bridgePostBoard(body) {
  return after(await eng.postBoard(body));
}

export async function bridgePutMasterboard(body) {
  return after(await eng.putMasterboard(body));
}

export async function bridgeFetchTimelogs() {
  return eng.fetchTimelogs();
}

export async function bridgePostTimelog(body) {
  return after(await eng.postTimelog(body));
}

export async function bridgePutTimelog(body) {
  return after(await eng.putTimelog(body));
}

export async function bridgeDeleteTimelog(body) {
  return after(await eng.deleteTimelogApi(body));
}

export async function bridgePutItem(body) {
  return after(await eng.putItem(body));
}

export async function bridgePostItem(body) {
  return after(await eng.postItem(body));
}

export async function bridgeDeleteItem(body) {
  return after(await eng.deleteItemApi(body));
}

export async function bridgePutDatabase(body) {
  await eng.putDatabase(body);
  schedulePersist();
  return eng.getWorkspace();
}

export async function bridgePostDatabase(body) {
  return after(await eng.postDatabase(body));
}

export async function bridgePostNotesTab(body) {
  return after(await eng.postNotesTab(body));
}

export async function bridgePostFilesTab(body) {
  return after(await eng.postFilesTab(body));
}

export async function bridgePutTab(body) {
  return after(await eng.putTab(body));
}

export async function bridgeDeleteTab(body) {
  const data = await eng.deleteTabApi(body);
  if (isPbMode() && data?.shareId) {
    await deleteShareRecord(data.shareId);
  }
  return after(data);
}

export async function bridgePutTabOrder(body) {
  return after(await eng.putTabOrder(body));
}

export async function bridgePostNote(body) {
  return after(await eng.postNote(body));
}

export async function bridgePutNote(body) {
  return after(await eng.putNote(body));
}

export async function bridgeDeleteNote(body) {
  return after(await eng.deleteNoteApi(body));
}

export async function bridgeMoveNote(body) {
  return after(await eng.moveNoteApi(body));
}

export async function bridgeFetchTrash() {
  return { trash: await eng.fetchTrash() };
}

export async function bridgeRestoreTrash(body) {
  const data = await eng.restoreTrashApi(body);
  if (!data.needsParent) schedulePersist();
  return data;
}

export async function bridgeResetSeed(seedDoc) {
  const data = await eng.resetWorkspaceToSeed(seedDoc);
  if (isPbMode()) {
    await installSeedDemoAttachments({ wipeExisting: true });
  }
  return after(data);
}

export async function bridgeResetEmpty() {
  return after(await eng.resetWorkspaceToEmpty());
}

export async function bridgePostFile(body) {
  const data = await eng.postFile(body);
  await syncAttachmentUp(body.project, body.filesTab, data.id, body.mime, body.name);
  return after(data);
}

export async function bridgePostCardFile(body) {
  const data = await eng.postCardFile(body);
  await syncAttachmentUp(body.project, body.board, data.id, body.mime, body.name);
  return after(data);
}

export async function bridgePostRteImage(body) {
  const data = await eng.postRteImage(body);
  const tabId =
    body.scope === "note"
      ? body.notesTab
      : body.scope === "card"
        ? body.board
        : COVER_TAB_ID;
  await syncAttachmentUp(body.project, tabId, data.id, body.mime, body.name);
  return after(data);
}

export async function bridgeGetFileBytes(project, tab, fileId) {
  let bytes = eng.getFileBlob(project, tab, fileId);
  if (!bytes) bytes = await syncAttachmentDown(project, tab, fileId);
  return bytes;
}

export async function bridgePutFile(body) {
  return after(await eng.putFile(body));
}

export async function bridgeDeleteFile(body) {
  const data = await eng.deleteFileApi(body);
  if (isPbMode() && body.file) {
    await deleteAttachment(attachmentKey(body.project, body.filesTab, body.file));
  }
  return after(data);
}

export async function bridgeDeleteCardFile(body) {
  const data = await eng.deleteCardFileApi(body);
  if (isPbMode() && body.file) {
    await deleteAttachment(attachmentKey(body.project, body.board, body.file));
  }
  return after(data);
}

export async function bridgeMoveFile(body) {
  return after(await eng.moveFileApi(body));
}

export async function bridgeMoveCardFiles(body) {
  return after(await eng.moveCardFilesApi(body));
}

export async function bridgeDeleteRteImage(body) {
  const data = await eng.deleteRteImageApi(body);
  if (isPbMode() && body.file) {
    const tabId =
      body.scope === "note"
        ? body.notesTab
        : body.scope === "card"
          ? body.board
          : COVER_TAB_ID;
    await deleteAttachment(attachmentKey(body.project, tabId, body.file));
  }
  return after(data);
}

export {
  flushPersist,
  eng as engine,
  COVER_TAB_ID,
  fileBlobStore,
  blobKey,
};
