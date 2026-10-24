/**
 * Maps src/api.js calls onto workspaceEngine + PB file persist.
 */
import { workspaceEngine as eng, COVER_TAB_ID } from "./workspaceEngine.js";
import { fileBlobStore, blobKey } from "./fileBlobStore.js";
import { isPbMode } from "../pb/client.js";
import {
  saveUserDocs,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  attachmentKey,
} from "../pb/persist.js";

let persistTimer = null;
let persistChain = Promise.resolve();
let persistHooked = false;

export function schedulePersist() {
  if (!isPbMode()) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistChain = persistChain
      .then(() => {
        const { workspace, archive } = eng.exportWorkspaceData();
        return saveUserDocs({ workspace, archive });
      })
      .catch((err) => console.error("persist failed", err));
  }, 400);
}

export function ensurePersistHook() {
  if (persistHooked) return;
  persistHooked = true;
  eng.setOnChange(() => schedulePersist());
}

async function flushPersist() {
  clearTimeout(persistTimer);
  await persistChain;
  if (isPbMode()) {
    const { workspace, archive } = eng.exportWorkspaceData();
    await saveUserDocs({ workspace, archive });
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
  return after(await eng.deleteProjectApi(body));
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
  return after(await eng.deleteTabApi(body));
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
  return after(await eng.resetWorkspaceToSeed(seedDoc));
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

export { flushPersist, eng as engine, COVER_TAB_ID, fileBlobStore, blobKey };
