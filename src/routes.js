/** Path-based app routes (no hash). IDs are workspace entity ids (see src/ids.js). */

export const ENTITY_TASKS = "tasks";
export const ENTITY_RECORDS = "records";
export const ENTITY_NOTES = "notes";
export const ENTITY_FILES = "files";

export const AUTH_SIGN_IN = "/sign-in";
export const AUTH_SIGN_UP = "/sign-up";
export const AUTH_RESET_PASSWORD = "/reset-password";
export const AUTH_PENDING_VERIFICATION = "/pending-verification";

/** AuthGate mode → path (emailChange stays on sign-in). */
export function authModeToPath(mode) {
  if (mode === "register") return AUTH_SIGN_UP;
  if (mode === "forgot" || mode === "reset") return AUTH_RESET_PASSWORD;
  if (mode === "pendingVerification") return AUTH_PENDING_VERIFICATION;
  return AUTH_SIGN_IN;
}

/** Path → AuthGate mode (token modes overlay in Root). */
export function pathToAuthMode(pathname) {
  const raw = String(pathname || "/").split("?")[0].split("#")[0];
  const parts = raw.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  if (parts[0] === "sign-up") return "register";
  if (parts[0] === "sign-in") return "login";
  if (parts[0] === "reset-password") return "forgot";
  if (parts[0] === "pending-verification") return "pendingVerification";
  return null;
}

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
 *   kind: "global" | "globalEntity" | "settings" | "project" | "cover" | "tab" | "entity" | "share" | "auth",
 *   g?: string,
 *   projectId?: string,
 *   tabId?: string,
 *   entityKind?: string,
 *   entityId?: string,
 *   shareId?: string,
 *   mode?: "login" | "register" | "forgot" | "pendingVerification",
 * }}
 * `cover` is legacy `/projects/:id/cover` (app redirects to project root).
 * Project root `/projects/:id` opens the cover tab.
 */
export function parsePath(pathname) {
  const raw = String(pathname || "/").split("?")[0].split("#")[0];
  const parts = raw.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    if (parts[0] === "settings") return { kind: "settings" };
    const authMode = pathToAuthMode("/" + parts[0]);
    if (authMode) return { kind: "auth", mode: authMode };
    const g = GLOBAL_PATH[parts[0]];
    if (g) return { kind: "global", g };
    return null;
  }

  // /master-board/tasks/:cardId
  if (
    parts.length === 3 &&
    parts[0] === "master-board" &&
    parts[1] === ENTITY_TASKS &&
    parts[2]
  ) {
    return {
      kind: "globalEntity",
      g: "Masterboard",
      entityKind: ENTITY_TASKS,
      entityId: parts[2],
    };
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
    const base = GLOBAL_TO_PATH[state.g] || "/master-board";
    if (
      state.g === "Masterboard" &&
      state.entityKind === ENTITY_TASKS &&
      state.entityId
    ) {
      return `${base}/${ENTITY_TASKS}/${state.entityId}`;
    }
    return base;
  }
  const projectId = state.projectId;
  if (!projectId) return "/master-board";
  // Cover is the project root; `/projects/:id/cover` is accepted as a redirect only.
  if (state.cover) return `/projects/${projectId}`;
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

/** Settings dialog section ids (URL `?tab=`). */
export const SETTINGS_TABS = [
  "experience",
  "account",
  "billing",
  "data",
  "archive",
  "help",
  "about",
  "developer",
];

const SETTINGS_TAB_SET = new Set(SETTINGS_TABS);

/**
 * @param {string} [search] location.search (with or without `?`)
 * @returns {string} valid tab id, default `experience`
 */
export function settingsTabFromSearch(search = window.location.search) {
  const raw = String(search || "");
  const q = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const tab = String(q.get("tab") || "").trim();
  return SETTINGS_TAB_SET.has(tab) ? tab : "experience";
}

/**
 * @param {string} [tab]
 * @returns {string} `/settings` or `/settings?tab=<id>` (experience → bare path)
 */
export function buildSettingsPath(tab) {
  const id = String(tab || "").trim();
  if (!id || id === "experience" || !SETTINGS_TAB_SET.has(id)) {
    return "/settings";
  }
  return `/settings?tab=${encodeURIComponent(id)}`;
}

/**
 * Navigate without adding history when the full URL already matches.
 * @param {string} path
 * @param {{
 *   replace?: boolean,
 *   search?: string | null,
 * }} [opts]
 *   `search` omitted — keep current query string.
 *   `search` `""` or `null` — clear query.
 *   otherwise use that query (with or without leading `?`).
 */
export function navigatePath(path, { replace = false, search } = {}) {
  const next = path || "/";
  let searchPart;
  if (search === null || search === "") {
    searchPart = "";
  } else if (search !== undefined) {
    const s = String(search);
    searchPart = !s ? "" : s.startsWith("?") ? s : `?${s}`;
  } else {
    searchPart = window.location.search;
  }
  const hash = window.location.hash || "";
  const url = next + searchPart + hash;
  const current =
    currentPathname() + (window.location.search || "") + (window.location.hash || "");
  if (current === url) return;
  if (replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}
