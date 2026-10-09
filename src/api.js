const JSON_HEADERS = { "Content-Type": "application/json" };

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
  return apiData("/api/workspace");
}

export async function putCard(body) {
  return apiData("/api/card", { method: "PUT", body });
}

export async function putCardOrder(body) {
  return apiData("/api/card-order", { method: "PUT", body });
}

export async function deleteCardApi(body) {
  return apiData("/api/card", { method: "DELETE", body });
}

export async function fetchTrash() {
  const data = await apiData("/api/trash");
  return data.trash || [];
}

export async function restoreTrashApi(body) {
  const { r, data } = await apiJson("/api/trash/restore", { method: "POST", body });
  if (data.needsParent) return data;
  if (!r.ok) throw new Error(data.error || "restore failed");
  return data;
}

export async function postCard(body) {
  return apiData("/api/card", { method: "POST", body });
}

export async function putProject(body) {
  return apiData("/api/project", { method: "PUT", body });
}

export async function postProject(body) {
  const { r, data } = await apiJson("/api/project", { method: "POST", body });
  return { ok: r.ok, data };
}

export async function deleteProjectApi(body) {
  return apiData("/api/project", { method: "DELETE", body });
}

export async function putProjectOrder(body) {
  return apiData("/api/project-order", { method: "PUT", body });
}

export async function putBoard(body) {
  return apiData("/api/board", { method: "PUT", body });
}

export async function postBoard(body) {
  return apiData("/api/board", { method: "POST", body });
}

export async function putMasterboard(body) {
  return apiData("/api/masterboard", { method: "PUT", body });
}

export async function fetchTimelogs() {
  const data = await apiData("/api/timelogs");
  return data.timelogs || [];
}

export async function postTimelog(body) {
  return apiData("/api/timelog", { method: "POST", body });
}

export async function putTimelog(body) {
  const { r, data } = await apiJson("/api/timelog", { method: "PUT", body });
  if (!r.ok) throw new Error("Could not update timelog");
  return data;
}

export async function deleteTimelogApi(body) {
  const { r, data } = await apiJson("/api/timelog", { method: "DELETE", body });
  if (!r.ok) throw new Error("Could not delete timelog");
  return data;
}

export async function putItem(body) {
  await fetch("/api/item", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postItem(body) {
  return apiData("/api/item", { method: "POST", body });
}

export async function putDatabase(body) {
  await fetch("/api/database", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postDatabase(body) {
  return apiData("/api/database", { method: "POST", body });
}

export async function postNotesTab(body) {
  return apiData("/api/notes-tab", { method: "POST", body });
}

export async function postFilesTab(body) {
  return apiData("/api/files-tab", { method: "POST", body });
}

export async function postFile(body) {
  return apiOkData("/api/file", { method: "POST", body }, "Could not upload file");
}

export async function putFile(body) {
  return apiOkData("/api/file", { method: "PUT", body }, "Could not rename file");
}

export async function deleteFileApi(body) {
  return apiData("/api/file", { method: "DELETE", body });
}

export function fileDownloadUrl(project, filesTab, file) {
  const q = new URLSearchParams({ project, filesTab, file });
  return `/api/file?${q.toString()}`;
}

export async function revealFile(body) {
  return apiOkData("/api/file/reveal", { method: "POST", body }, "Could not show file");
}

export async function revealFilesTab(body) {
  return apiOkData(
    "/api/files-tab/reveal",
    { method: "POST", body },
    "Could not open folder"
  );
}

export async function moveFileApi(body) {
  return apiOkData("/api/file/move", { method: "POST", body }, "Could not move file");
}

export async function putTab(body) {
  return apiData("/api/tab", { method: "PUT", body });
}

export async function deleteTabApi(body) {
  return apiData("/api/tab", { method: "DELETE", body });
}

export async function putTabOrder(body) {
  return apiData("/api/tab-order", { method: "PUT", body });
}

export async function postNote(body) {
  return apiData("/api/note", { method: "POST", body });
}

export async function putNote(body) {
  return apiData("/api/note", { method: "PUT", body });
}

export async function deleteNoteApi(body) {
  return apiData("/api/note", { method: "DELETE", body });
}

export async function moveNoteApi(body) {
  return apiOkData("/api/note/move", { method: "POST", body }, "Could not move note");
}

/** Timelog entries for one board card, newest first. */
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

export async function revealUserData() {
  const r = await fetch("/api/user-data/reveal", { method: "POST" });
  if (!r.ok) throw new Error("reveal failed");
  return r.json();
}

export async function exportWorkspace() {
  const r = await fetch("/api/export");
  if (!r.ok) throw new Error("export failed");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "userWorkspace.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchAppInfo() {
  return apiData("/api/app");
}

export async function fetchBackupSettings() {
  return apiOkData("/api/backup", {}, "backup settings failed");
}

export async function saveBackupSettings(body) {
  return apiOkData("/api/backup", { method: "PUT", body }, "could not save backup settings");
}

export async function runBackupNow() {
  return apiOkData("/api/backup/now", { method: "POST" }, "backup failed");
}

export async function pickBackupFolder() {
  return apiOkData("/api/backup/pick-folder", { method: "POST" }, "could not pick folder");
}

export async function importBackup(body) {
  return apiOkData("/api/backup/import", { method: "POST", body: body || {} }, "import failed");
}

export async function resetWorkspaceToSeed() {
  const r = await fetch("/api/workspace/reset-seed", { method: "POST" });
  if (!r.ok) throw new Error("reset failed");
  return r.json();
}

export async function resetWorkspaceToEmpty() {
  const r = await fetch("/api/workspace/reset-empty", { method: "POST" });
  if (!r.ok) throw new Error("reset failed");
  return r.json();
}
