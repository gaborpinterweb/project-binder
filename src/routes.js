/** Path-based app routes (no hash). IDs are workspace UUIDs. */

export const ENTITY_TASKS = "tasks";
export const ENTITY_RECORDS = "records";
export const ENTITY_NOTES = "notes";
export const ENTITY_FILES = "files";

const GLOBAL_PATH = {
  "master-board": "Masterboard",
  timelogs: "Timelogs",
  trash: "Trash",
};

const GLOBAL_TO_PATH = {
  Masterboard: "/master-board",
  Timelogs: "/timelogs",
  Trash: "/trash",
};

/** Mod type → URL entity segment. */
export function modTypeToEntityKind(modType) {
  if (modType === "Board") return ENTITY_TASKS;
  if (modType === "Database") return ENTITY_RECORDS;
  if (modType === "Notes") return ENTITY_NOTES;
  if (modType === "Files") return ENTITY_FILES;
  return null;
}

/** URL entity segment → expected mod type. */
export function entityKindToModType(entityKind) {
  if (entityKind === ENTITY_TASKS) return "Board";
  if (entityKind === ENTITY_RECORDS) return "Database";
  if (entityKind === ENTITY_NOTES) return "Notes";
  if (entityKind === ENTITY_FILES) return "Files";
  return null;
}

/**
 * @returns {null | {
 *   kind: "global" | "settings" | "project" | "cover" | "tab" | "entity" | "share",
 *   g?: string,
 *   projectId?: string,
 *   tabId?: string,
 *   entityKind?: string,
 *   entityId?: string,
 *   shareId?: string,
 * }}
 */
export function parsePath(pathname) {
  const raw = String(pathname || "/").split("?")[0].split("#")[0];
  const parts = raw.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    if (parts[0] === "settings") return { kind: "settings" };
    const g = GLOBAL_PATH[parts[0]];
    if (g) return { kind: "global", g };
    return null;
  }

  if (parts[0] === "share" && parts[1] && parts.length === 2) {
    return { kind: "share", shareId: parts[1] };
  }

  if (parts[0] !== "projects" || !parts[1]) return null;
  const projectId = parts[1];

  if (parts.length === 2) {
    return { kind: "project", projectId };
  }

  if (parts.length === 3 && parts[2] === "cover") {
    return { kind: "cover", projectId };
  }

  if (parts[2] !== "tabs" || !parts[3]) return null;
  const tabId = parts[3];

  if (parts.length === 4) {
    return { kind: "tab", projectId, tabId };
  }

  if (parts.length === 6) {
    const entityKind = parts[4];
    const entityId = parts[5];
    if (!entityKindToModType(entityKind) || !entityId) return null;
    return { kind: "entity", projectId, tabId, entityKind, entityId };
  }

  return null;
}

/**
 * @param {{
 *   g?: string | null,
 *   settings?: boolean,
 *   projectId?: string | null,
 *   cover?: boolean,
 *   tabId?: string | null,
 *   entityKind?: string | null,
 *   entityId?: string | null,
 * }} state
 */
export function buildPath(state = {}) {
  if (state.settings) return "/settings";
  if (state.g) {
    return GLOBAL_TO_PATH[state.g] || "/master-board";
  }
  const projectId = state.projectId;
  if (!projectId) return "/master-board";
  if (state.cover) return `/projects/${projectId}/cover`;
  const tabId = state.tabId;
  if (!tabId) return `/projects/${projectId}`;
  const base = `/projects/${projectId}/tabs/${tabId}`;
  if (state.entityKind && state.entityId) {
    return `${base}/${state.entityKind}/${state.entityId}`;
  }
  return base;
}

export function currentPathname() {
  return window.location.pathname || "/";
}

/** Navigate without adding history when path already matches. */
export function navigatePath(path, { replace = false } = {}) {
  const next = path || "/";
  if (currentPathname() === next) return;
  const url = next + window.location.search + window.location.hash;
  if (replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}
