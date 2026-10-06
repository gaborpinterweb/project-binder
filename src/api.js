export async function fetchWorkspace() {
  const r = await fetch("/api/workspace");
  return r.json();
}

export async function putCard(body) {
  const r = await fetch("/api/card", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putCardOrder(body) {
  const r = await fetch("/api/card-order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function deleteCardApi(body) {
  const r = await fetch("/api/card", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function fetchTrash() {
  const data = await fetch("/api/trash").then((r) => r.json());
  return data.trash || [];
}

export async function restoreTrashApi(body) {
  const r = await fetch("/api/trash/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (data.needsParent) return data;
  if (!r.ok) throw new Error(data.error || "restore failed");
  return data;
}

export async function postCard(body) {
  const r = await fetch("/api/card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putProject(body) {
  const r = await fetch("/api/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function postProject(body) {
  const r = await fetch("/api/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json() };
}

export async function deleteProjectApi(body) {
  const r = await fetch("/api/project", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putBoard(body) {
  const r = await fetch("/api/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function postBoard(body) {
  const r = await fetch("/api/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putMasterboard(body) {
  const r = await fetch("/api/masterboard", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function fetchTimelogs() {
  const data = await fetch("/api/timelogs").then((r) => r.json());
  return data.timelogs || [];
}

export async function postTimelog(body) {
  const r = await fetch("/api/timelog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putTimelog(body) {
  const r = await fetch("/api/timelog", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Could not update timelog");
  return r.json();
}

export async function deleteTimelogApi(body) {
  const r = await fetch("/api/timelog", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Could not delete timelog");
  return r.json();
}

export async function putItem(body) {
  await fetch("/api/item", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postItem(body) {
  const r = await fetch("/api/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putDatabase(body) {
  await fetch("/api/database", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postDatabase(body) {
  const r = await fetch("/api/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function postNotesTab(body) {
  const r = await fetch("/api/notes-tab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function postFilesTab(body) {
  const r = await fetch("/api/files-tab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function postFile(body) {
  const r = await fetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Could not upload file");
  }
  return r.json();
}

export async function putFile(body) {
  const r = await fetch("/api/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Could not rename file");
  }
  return r.json();
}

export async function deleteFileApi(body) {
  const r = await fetch("/api/file", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export function fileDownloadUrl(project, filesTab, file) {
  const q = new URLSearchParams({ project, filesTab, file });
  return `/api/file?${q.toString()}`;
}

export async function putTab(body) {
  const r = await fetch("/api/tab", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function deleteTabApi(body) {
  const r = await fetch("/api/tab", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putTabOrder(body) {
  const r = await fetch("/api/tab-order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function postNote(body) {
  const r = await fetch("/api/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putNote(body) {
  const r = await fetch("/api/note", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function deleteNoteApi(body) {
  const r = await fetch("/api/note", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function moveNoteApi(body) {
  const r = await fetch("/api/note/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Could not move note");
  }
  return r.json();
}

export async function cardTimeSpentSec(project, board, card) {
  if (!project || !board || !card) return 0;
  try {
    const entries = await fetchTimelogs();
    return entries
      .filter((e) => e.project === project && e.board === board && e.card === card)
      .reduce((sum, e) => sum + (e.durationSec || 0), 0);
  } catch {
    return 0;
  }
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
