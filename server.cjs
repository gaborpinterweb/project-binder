#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const {
  createUserDataStore,
  isValidStore,
  emptyArchiveDoc,
} = require("./userDataStore.cjs");

const SEED_WORKSPACE = path.join(__dirname, "seedWorkspace.json");
const SEED_UPLOADS = path.join(__dirname, "seedUploads");
const userData = createUserDataStore({
  seedUploadsDir: SEED_UPLOADS,
});
const USER_DATA_DIR = userData.dir;
const USER_WORKSPACE = userData.workspacePath;
const DEFAULT_PORT = 3457;
function resolvePort() {
  const raw = process.env.PROJECT_BINDER_PORT || process.env.PORT;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_PORT;
}
const PORT = resolvePort();
const DIST = path.join(__dirname, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};
const DEFAULT_STAGES = ["Backlog", "This week", "Today", "Tomorrow", "Next week"];
const DEFAULT_BOARD_COLS = ["Idea", "Mandatory"];
const IMPACT_LEVELS = ["Low", "Medium", "High"];
const EFFORT_LEVELS = ["Low", "Medium", "High"];
const LEGACY_DIFFICULTY_TO_EFFORT = {
  Easy: "Low",
  Medium: "Medium",
  Hard: "High",
};

function normalizeImpact(v) {
  const s = String(v || "");
  return IMPACT_LEVELS.includes(s) ? s : "";
}

function normalizeEffort(v) {
  const s = String(v || "");
  if (EFFORT_LEVELS.includes(s)) return s;
  return LEGACY_DIFFICULTY_TO_EFFORT[s] || "";
}

/** Apply Impact / Effort; migrate legacy priority → Impact High, difficulty → effort. */
function applyCardMeta(target, src) {
  const impact = normalizeImpact(src.impact) || (src.priority ? "High" : "");
  const effortRaw = src.effort != null && src.effort !== "" ? src.effort : src.difficulty;
  const effort = normalizeEffort(effortRaw);
  if (impact) target.impact = impact;
  else delete target.impact;
  if (effort) target.effort = effort;
  else delete target.effort;
  delete target.priority;
  delete target.difficulty;
}
const NAME_COL_ID = "n";
const DEFAULT_DB_COLS = [
  { id: NAME_COL_ID, label: "Name", type: "text" },
  { id: "r", label: "Role", type: "text" },
  { id: "s", label: "Stage", type: "stage" },
];

const DEFAULT_CUSTOM_VIEW_ID = "default";
const DEFAULT_CUSTOM_VIEW_NAME = "Default view";

function emptyFilterState() {
  return {
    junction: "and",
    rules: [{ id: "f0", fieldId: "", op: "", value: "" }],
  };
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== "object") return emptyFilterState();
  const junction = filters.junction === "or" ? "or" : "and";
  const rules = Array.isArray(filters.rules)
    ? filters.rules
        .map((r, i) => {
          if (!r || typeof r !== "object") return null;
          return {
            id: String(r.id || "f" + i),
            fieldId: String(r.fieldId || ""),
            op: String(r.op || ""),
            value: r.value != null ? r.value : "",
          };
        })
        .filter(Boolean)
    : [];
  return { junction, rules: rules.length ? rules : emptyFilterState().rules };
}

function normalizeHiddenCols(hiddenCols) {
  if (!Array.isArray(hiddenCols)) return [];
  const seen = new Set();
  const out = [];
  for (const id of hiddenCols) {
    const s = String(id || "");
    if (!s || s === NAME_COL_ID || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function createSortRule() {
  return {
    id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fieldId: "",
    dir: "asc",
  };
}

function emptySortState() {
  return { rules: [createSortRule()] };
}

function normalizeSorts(sorts) {
  if (!sorts || typeof sorts !== "object") return emptySortState();
  const rules = Array.isArray(sorts.rules)
    ? sorts.rules
        .map((r, i) => {
          if (!r || typeof r !== "object") return null;
          return {
            id: String(r.id || "s" + i),
            fieldId: String(r.fieldId || ""),
            dir: r.dir === "desc" ? "desc" : "asc",
          };
        })
        .filter(Boolean)
    : [];
  return { rules: rules.length ? rules : emptySortState().rules };
}

const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 720;

function normalizeColWidths(colWidths) {
  if (!colWidths || typeof colWidths !== "object" || Array.isArray(colWidths)) {
    return {};
  }
  const out = {};
  for (const [rawId, rawW] of Object.entries(colWidths)) {
    const id = String(rawId || "");
    const n = Math.round(Number(rawW));
    if (!id || !Number.isFinite(n)) continue;
    out[id] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, n));
  }
  return out;
}

function createDefaultCustomView(
  filters,
  hiddenCols,
  sorts,
  wrapLines,
  verticalBorders,
  colWidths
) {
  return {
    id: DEFAULT_CUSTOM_VIEW_ID,
    name: DEFAULT_CUSTOM_VIEW_NAME,
    filters: normalizeFilters(filters),
    hiddenCols: normalizeHiddenCols(hiddenCols),
    sorts: normalizeSorts(sorts),
    wrapLines: !!wrapLines,
    // Missing → on (legacy presets + new defaults).
    verticalBorders: verticalBorders !== false,
    colWidths: normalizeColWidths(colWidths),
  };
}

function normalizeCustomViews(views) {
  const extras = [];
  let defaultFilters = emptyFilterState();
  let defaultHiddenCols = [];
  let defaultSorts = emptySortState();
  let defaultWrapLines = false;
  let defaultVerticalBorders = true;
  let defaultColWidths = {};
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.id == null) continue;
    const id = String(v.id);
    if (id === DEFAULT_CUSTOM_VIEW_ID) {
      defaultFilters = normalizeFilters(v.filters);
      defaultHiddenCols = normalizeHiddenCols(v.hiddenCols);
      defaultSorts = normalizeSorts(v.sorts);
      defaultWrapLines = !!v.wrapLines;
      defaultVerticalBorders = v.verticalBorders !== false;
      defaultColWidths = normalizeColWidths(v.colWidths);
      continue;
    }
    extras.push({
      id,
      name: String(v.name || "Untitled view").trim() || "Untitled view",
      filters: normalizeFilters(v.filters),
      hiddenCols: normalizeHiddenCols(v.hiddenCols),
      sorts: normalizeSorts(v.sorts),
      wrapLines: !!v.wrapLines,
      verticalBorders: v.verticalBorders !== false,
      colWidths: normalizeColWidths(v.colWidths),
    });
  }
  return [
    createDefaultCustomView(
      defaultFilters,
      defaultHiddenCols,
      defaultSorts,
      defaultWrapLines,
      defaultVerticalBorders,
      defaultColWidths
    ),
    ...extras,
  ];
}

function resolveCustomViewId(viewId, views) {
  const list = normalizeCustomViews(views);
  if (viewId && list.some((v) => v.id === viewId)) return String(viewId);
  return DEFAULT_CUSTOM_VIEW_ID;
}

const DB_FIELD_TYPES = new Set([
  "text",
  "longtext",
  "url",
  "select",
  "multiselect",
  "checkbox",
  "number",
  "date",
  "stage",
]);

const DB_SELECT_COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

function normalizeSelectOption(o, index) {
  if (o == null) return null;
  if (typeof o === "string") {
    const label = o.trim();
    if (!label) return null;
    const palette = DB_SELECT_COLORS.filter((c) => c !== "default");
    return { label, color: palette[index % palette.length] };
  }
  if (typeof o !== "object") return null;
  const label = String(o.label != null ? o.label : o.value != null ? o.value : "")
    .trim();
  if (!label) return null;
  const color = DB_SELECT_COLORS.includes(o.color)
    ? o.color
    : DB_SELECT_COLORS.filter((c) => c !== "default")[index % (DB_SELECT_COLORS.length - 1)];
  return { label, color };
}

function nameColumn() {
  return { id: NAME_COL_ID, label: "Name", type: "text" };
}

function normalizeDbColumn(c) {
  if (!c || !c.id) return null;
  if (String(c.id) === NAME_COL_ID) return nameColumn();
  const type = DB_FIELD_TYPES.has(c.type) ? c.type : "text";
  const out = { id: String(c.id), label: c.label || String(c.id), type };
  if (type === "select" || type === "multiselect") {
    out.options = Array.isArray(c.options)
      ? c.options.map((o, i) => normalizeSelectOption(o, i)).filter(Boolean)
      : [];
  }
  return out;
}

function normalizeDbColumns(columns) {
  if (!Array.isArray(columns) || !columns.length) {
    return DEFAULT_DB_COLS.map((c) => ({ ...c }));
  }
  const rest = columns
    .map(normalizeDbColumn)
    .filter((c) => c && c.id !== NAME_COL_ID);
  return [nameColumn(), ...rest];
}

/** @type {object|null} */
let store = null;
/** Archived projects live here — never written into userWorkspace.json. */
/** @type {{ version: number, projects: object[] }} */
let archiveStore = emptyArchiveDoc();

const ID_LENGTH = 12;
const ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_RE = new RegExp(`^[${ID_ALPHABET}]{${ID_LENGTH}}$`);
const ID_BYTE_MAX = 256 - (256 % ID_ALPHABET.length);
/** Same fixed id as client COVER_TAB_ID — cover RTE images live under this upload folder. */
const COVER_TAB_ID = "0000000000c0";

function newId() {
  let out = "";
  while (out.length < ID_LENGTH) {
    const bytes = crypto.randomBytes(ID_LENGTH - out.length + 4);
    for (const b of bytes) {
      if (b >= ID_BYTE_MAX) continue;
      out += ID_ALPHABET[b % ID_ALPHABET.length];
      if (out.length === ID_LENGTH) break;
    }
  }
  return out;
}

function isSafePathId(s) {
  return typeof s === "string" && ID_RE.test(s);
}

function isDemoValue(v) {
  return v === true || String(v || "").toLowerCase() === "true";
}

function isArchivedValue(v) {
  return v === true || String(v || "").toLowerCase() === "true";
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Seed file treats this local calendar day as "today"; shifted on every seed load. */
const SEED_ANCHOR_YMD = "2026-09-30";
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseLocalYmd(ymd) {
  const [y, m, day] = String(ymd).split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-based local week start. */
function startOfLocalWeek(d) {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addLocalDays(x, diff);
}

function localDayDelta(fromYmd, toDate) {
  const a = startOfLocalDay(parseLocalYmd(fromYmd));
  const b = startOfLocalDay(toDate);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function shiftIsoByLocalDays(iso, days) {
  if (!days) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function shiftYmdByDays(ymd, days) {
  if (!days) return ymd;
  return formatLocalYmd(addLocalDays(parseLocalYmd(ymd), days));
}

function rebaseSeedDates(value, days) {
  if (!days) return value;
  if (typeof value === "string") {
    if (ISO_DATETIME_RE.test(value)) return shiftIsoByLocalDays(value, days);
    if (YMD_RE.test(value)) return shiftYmdByDays(value, days);
    return value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = rebaseSeedDates(value[i], days);
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = rebaseSeedDates(value[key], days);
    return value;
  }
  return value;
}

function placeTimelogOnLocalDay(entry, dayStart) {
  const prev = new Date(entry.startedAt || entry.endedAt || Date.now());
  const start = new Date(dayStart);
  if (!Number.isNaN(prev.getTime())) {
    start.setHours(
      prev.getHours(),
      prev.getMinutes(),
      prev.getSeconds(),
      prev.getMilliseconds()
    );
  } else {
    start.setHours(10, 0, 0, 0);
  }
  let dur = Number(entry.durationSec);
  if (!Number.isFinite(dur) || dur < 0) {
    const endPrev = new Date(entry.endedAt || 0);
    dur =
      !Number.isNaN(prev.getTime()) && !Number.isNaN(endPrev.getTime())
        ? Math.max(0, Math.round((endPrev.getTime() - prev.getTime()) / 1000))
        : 1500;
  }
  entry.startedAt = start.toISOString();
  entry.endedAt = new Date(start.getTime() + dur * 1000).toISOString();
  entry.durationSec = dur;
}

/**
 * After calendar rebase, pin a couple of timelogs so Today / This week / Last week /
 * Last month filters stay populated regardless of weekday or month length.
 */
function ensureSeedTimelogPeriods(doc, now = new Date()) {
  const logs = doc.timelogs;
  if (!Array.isArray(logs) || logs.length < 2) return;
  const ordered = logs
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      String(a.entry.startedAt || "").localeCompare(String(b.entry.startedAt || ""))
    );
  const today = startOfLocalDay(now);
  const lastWeekDay = addLocalDays(startOfLocalWeek(today), -3); // last week's Wednesday
  const lastMonthDay = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  placeTimelogOnLocalDay(ordered[0].entry, lastMonthDay);
  placeTimelogOnLocalDay(ordered[1].entry, lastWeekDay);
}

function prepareSeedWorkspace(doc, now = new Date()) {
  const days = localDayDelta(SEED_ANCHOR_YMD, now);
  rebaseSeedDates(doc, days);
  ensureSeedTimelogPeriods(doc, now);
  return doc;
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return { ok: false, reason: "missing" };
  const raw = fs.readFileSync(file, "utf8");
  if (!String(raw).trim()) return { ok: false, reason: "empty" };
  try {
    const doc = JSON.parse(raw);
    if (!isValidStore(doc)) return { ok: false, reason: "invalid" };
    return { ok: true, doc };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

function loadSeedWorkspace() {
  const result = readJsonFile(SEED_WORKSPACE);
  if (!result.ok) {
    console.error(`Fatal: seedWorkspace.json is ${result.reason} (${SEED_WORKSPACE})`);
    process.exit(1);
  }
  return prepareSeedWorkspace(deepClone(result.doc));
}

function saveStore() {
  if (!store) throw new Error("store not initialized");
  if (!archiveStore) archiveStore = emptyArchiveDoc();
  userData.writeWorkspaceFile(store);
  userData.writeArchiveFile(archiveStore);
}

function loadArchiveStore() {
  const result = userData.readArchiveFile();
  if (result.ok) {
    archiveStore = deepClone(result.doc);
    if (!Array.isArray(archiveStore.projects)) archiveStore.projects = [];
    if (!Number(archiveStore.version) || archiveStore.version < 2) {
      archiveStore.version = 2;
    }
    return;
  }
  archiveStore = emptyArchiveDoc();
}

/** Peel archived projects out of the active workspace into archiveStore. */
function migrateArchivedOutOfWorkspace() {
  const projects = store.projects || [];
  const active = [];
  const moved = [];
  for (const p of projects) {
    if (isArchivedValue(p.archived)) {
      p.archived = true;
      moved.push(p);
    } else {
      delete p.archived;
      active.push(p);
    }
  }
  if (!moved.length) return false;
  store.projects = active;
  if (!Array.isArray(archiveStore.projects)) archiveStore.projects = [];
  const byId = new Set(archiveStore.projects.map((p) => p.id));
  for (const p of moved) {
    if (byId.has(p.id)) continue;
    archiveStore.projects.push(p);
    byId.add(p.id);
  }
  return true;
}

function initStoreFromDoc(doc, { reloadArchive = true } = {}) {
  store = deepClone(doc);
  ensureTrash();
  if (reloadArchive) loadArchiveStore();
  return migrateArchivedOutOfWorkspace();
}

/** Legacy slug workspace must not be overwritten by seed — migrate first (see docs/migrate-slugs-to-uids.md). */
function looksLikeLegacySlugWorkspace(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!doc || typeof doc !== "object") return false;
    if (Number(doc.version) >= 2) return false;
    const projects = doc.projects;
    if (!Array.isArray(projects) || !projects.length) return false;
    return typeof projects[0].slug === "string" && !projects[0].id;
  } catch {
    return false;
  }
}

function ensureStore() {
  if (userData.persistent) {
    const user = userData.readWorkspaceFile();
    if (user.ok) {
      const migrated = initStoreFromDoc(user.doc);
      const purged = purgeExpiredTrash();
      if (migrated || purged) saveStore();
      return { reseeded: false, purged };
    }
    if (looksLikeLegacySlugWorkspace(USER_WORKSPACE)) {
      console.error(
        `Refusing to replace legacy slug workspace at ${USER_WORKSPACE}.\n` +
          "Migrate to entity ids first — see docs/migrate-slugs-to-uids.md"
      );
      process.exit(1);
    }
    archiveStore = emptyArchiveDoc();
    initStoreFromDoc(loadSeedWorkspace(), { reloadArchive: false });
    installSeedUploads();
    saveStore();
    return { reseeded: true, reason: user.reason, purged: 0 };
  }
  archiveStore = emptyArchiveDoc();
  initStoreFromDoc(loadSeedWorkspace(), { reloadArchive: false });
  installSeedUploads();
  return { reseeded: true, reason: "memory", purged: 0 };
}

function clearUploads() {
  userData.clearUploads();
}

function installSeedUploads() {
  userData.installSeedUploads();
}

function resetToSeedWorkspace() {
  archiveStore = emptyArchiveDoc();
  initStoreFromDoc(loadSeedWorkspace(), { reloadArchive: false });
  installSeedUploads();
  saveStore();
}

function emptyWorkspaceDoc() {
  return {
    version: 2,
    stages: DEFAULT_STAGES.slice(),
    projects: [],
    timelogs: [],
    trash: [],
  };
}

function resetToEmptyWorkspace() {
  store = emptyWorkspaceDoc();
  archiveStore = emptyArchiveDoc();
  clearUploads();
  saveStore();
}

function findProject(id) {
  return (store.projects || []).find((p) => p.id === id) || null;
}

function findArchivedProject(id) {
  return (archiveStore.projects || []).find((p) => p.id === id) || null;
}

function findBoard(project, boardId) {
  if (!project) return null;
  return (project.boards || []).find((b) => b.id === boardId) || null;
}

function findDatabase(project, dbId) {
  if (!project) return null;
  return (project.databases || []).find((d) => d.id === dbId) || null;
}

function findNotesTab(project, tabId) {
  if (!project) return null;
  return (project.notesTabs || []).find((t) => t.id === tabId) || null;
}

function findFilesTab(project, tabId) {
  if (!project) return null;
  return (project.filesTabs || []).find((t) => t.id === tabId) || null;
}

function removeUploadTree(projectId, tabId) {
  if (!isSafePathId(projectId) || !isSafePathId(tabId)) return;
  userData.removeUploadTree(projectId, tabId);
}

function tabKey(type, id) {
  return `${type}:${id}`;
}

function defaultTabOrderEntries(project) {
  return [
    ...(project.boards || []).map((b) => ({ type: "board", id: b.id })),
    ...(project.notesTabs || []).map((t) => ({ type: "notes", id: t.id })),
    ...(project.filesTabs || []).map((t) => ({ type: "files", id: t.id })),
    ...(project.databases || []).map((d) => ({ type: "database", id: d.id })),
  ];
}

function normalizeTabOrder(project) {
  const valid = new Map();
  for (const e of defaultTabOrderEntries(project)) {
    valid.set(tabKey(e.type, e.id), e);
  }
  const next = [];
  const seen = new Set();
  for (const raw of project.tabOrder || []) {
    if (!raw || !raw.type || !raw.id) continue;
    const type = String(raw.type);
    const id = String(raw.id);
    const key = tabKey(type, id);
    if (!valid.has(key) || seen.has(key)) continue;
    next.push({ type, id });
    seen.add(key);
  }
  for (const e of defaultTabOrderEntries(project)) {
    const key = tabKey(e.type, e.id);
    if (seen.has(key)) continue;
    next.push(e);
    seen.add(key);
  }
  project.tabOrder = next;
  return next;
}

function appendTabOrder(project, type, id) {
  normalizeTabOrder(project);
  const key = tabKey(type, id);
  if (project.tabOrder.some((e) => tabKey(e.type, e.id) === key)) return;
  project.tabOrder.push({ type, id });
}

function removeTabOrder(project, type, id) {
  if (!project.tabOrder) return;
  const key = tabKey(type, id);
  project.tabOrder = project.tabOrder.filter((e) => tabKey(e.type, e.id) !== key);
}

function renameTab(projectId, type, id, name) {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  const title = String(name || "").trim();
  if (!title) return { ok: false, error: "missing fields" };
  if (type === "board") {
    const board = findBoard(project, id);
    if (!board) return { ok: false, error: "tab not found" };
    board.name = title;
    return { ok: true };
  }
  if (type === "notes") {
    const tab = findNotesTab(project, id);
    if (!tab) return { ok: false, error: "tab not found" };
    tab.name = title;
    return { ok: true };
  }
  if (type === "database") {
    const db = findDatabase(project, id);
    if (!db) return { ok: false, error: "tab not found" };
    db.name = title;
    return { ok: true };
  }
  if (type === "files") {
    const tab = findFilesTab(project, id);
    if (!tab) return { ok: false, error: "tab not found" };
    tab.name = title;
    return { ok: true };
  }
  return { ok: false, error: "invalid type" };
}

function deleteTab(projectId, type, id) {
  if (type === "board") return softDeleteBoard(projectId, id);
  if (type === "notes") return softDeleteNotesTab(projectId, id);
  if (type === "files") return softDeleteFilesTab(projectId, id);
  // databases stay hard-delete for now
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  if (type === "database") {
    const idx = (project.databases || []).findIndex((d) => d.id === id);
    if (idx < 0) return { ok: false, error: "tab not found" };
    project.databases.splice(idx, 1);
    removeTabOrder(project, type, id);
    return { ok: true };
  }
  return { ok: false, error: "invalid type" };
}

function writeTabOrder(projectId, order) {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  if (!Array.isArray(order)) return { ok: false, error: "missing fields" };
  const valid = new Map();
  for (const e of defaultTabOrderEntries(project)) {
    valid.set(tabKey(e.type, e.id), e);
  }
  const next = [];
  const seen = new Set();
  for (const raw of order) {
    if (!raw || !raw.type || !raw.id) continue;
    const type = String(raw.type);
    const id = String(raw.id);
    const key = tabKey(type, id);
    if (!valid.has(key) || seen.has(key)) continue;
    next.push({ type, id });
    seen.add(key);
  }
  for (const e of defaultTabOrderEntries(project)) {
    const key = tabKey(e.type, e.id);
    if (seen.has(key)) continue;
    next.push(e);
    seen.add(key);
  }
  project.tabOrder = next;
  return { ok: true };
}

function writeProjectOrder(order) {
  if (!Array.isArray(order)) return { ok: false, error: "missing fields" };
  const byId = new Map((store.projects || []).map((p) => [p.id, p]));
  const next = [];
  const seen = new Set();
  for (const raw of order) {
    const id = String(raw || "");
    if (!id || !byId.has(id) || seen.has(id)) continue;
    next.push(byId.get(id));
    seen.add(id);
  }
  for (const p of store.projects || []) {
    if (seen.has(p.id)) continue;
    next.push(p);
  }
  store.projects = next;
  return { ok: true };
}

function projectIsArchived(id) {
  if (findArchivedProject(id)) return true;
  const p = findProject(id);
  return p ? isArchivedValue(p.archived) : false;
}

function moveProjectToArchive(projectId) {
  const idx = (store.projects || []).findIndex((p) => p.id === projectId);
  if (idx < 0) return false;
  const [p] = store.projects.splice(idx, 1);
  p.archived = true;
  if (!Array.isArray(archiveStore.projects)) archiveStore.projects = [];
  const aIdx = archiveStore.projects.findIndex((x) => x.id === projectId);
  if (aIdx >= 0) archiveStore.projects[aIdx] = p;
  else archiveStore.projects.push(p);
  return true;
}

function moveProjectFromArchive(projectId) {
  const idx = (archiveStore.projects || []).findIndex((p) => p.id === projectId);
  if (idx < 0) return false;
  const [p] = archiveStore.projects.splice(idx, 1);
  delete p.archived;
  if (!Array.isArray(store.projects)) store.projects = [];
  store.projects.push(p);
  return true;
}

function readArchivedProjectsMeta() {
  const projects = (archiveStore.projects || []).map((p) => ({
    id: p.id,
    name: p.name || p.id,
    color: p.color || "#3c3c40",
  }));
  return { projects };
}

function normalizeColumns(columns) {
  if (Array.isArray(columns)) {
    return columns
      .map((c) => (typeof c === "string" ? c : c && c.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }
  return String(columns || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function projectToApi(p) {
  const out = {
    id: p.id,
    name: p.name || p.id,
    color: p.color || "#3c3c40",
    cover: (() => {
      const coverImages = normalizeCardFiles(p.coverImages);
      const cover = { values: { description: p.description || "" } };
      if (coverImages.length) cover.images = coverImages;
      return cover;
    })(),
    boards: (p.boards || []).map((b) => {
      const board = {
        id: b.id,
        name: b.name || b.id,
        columns: Array.isArray(b.columns) && b.columns.length ? b.columns.slice() : DEFAULT_BOARD_COLS.slice(),
        cards: (b.cards || []).map((c) => {
          const card = {
            id: c.id,
            title: c.title || c.id,
            status: c.status || (b.columns && b.columns[0]) || DEFAULT_BOARD_COLS[0],
            master: c.master || "Backlog",
            doneAt: c.doneAt || "",
            body: c.body || "",
          };
          if (c.ord != null && c.ord !== "" && !Number.isNaN(Number(c.ord))) {
            card.ord = Number(c.ord);
          }
          applyCardMeta(card, c);
          const files = normalizeCardFiles(c.files);
          if (files.length) card.files = files;
          const images = normalizeCardFiles(c.images);
          if (images.length) card.images = images;
          if (isDemoValue(c.isDemo)) card.isDemo = true;
          return card;
        }),
      };
      if (isDemoValue(b.isDemo)) board.isDemo = true;
      return board;
    }),
    databases: (p.databases || []).map((d) => {
      const customViews = normalizeCustomViews(d.customViews);
      return {
        id: d.id,
        name: d.name || d.id,
        columns: normalizeDbColumns(d.columns),
        customViews,
        customViewId: resolveCustomViewId(d.customViewId, customViews),
        items: (d.items || []).map((item) => ({
          id: item.id,
          fields: { ...(item.fields || {}) },
          body: item.body || "",
        })),
      };
    }),
    notesTabs: (p.notesTabs || []).map((t) => ({
      id: t.id,
      name: t.name || t.id,
      notes: (t.notes || []).map((n) => {
        const note = {
          id: n.id,
          title: n.title || n.id,
          body: n.body || "",
          createdAt: n.createdAt || n.updatedAt || "",
          updatedAt: n.updatedAt || "",
        };
        if (n.pinned) note.pinned = true;
        const images = normalizeCardFiles(n.images);
        if (images.length) note.images = images;
        return note;
      }),
    })),
    filesTabs: (p.filesTabs || []).map((t) => ({
      id: t.id,
      name: t.name || t.id,
      files: (t.files || []).map((f) => ({
        id: f.id,
        name: f.name || f.id,
        mime: f.mime || "application/octet-stream",
        size: Number(f.size) || 0,
        createdAt: f.createdAt || "",
      })),
    })),
    tabOrder: normalizeTabOrder(p).map((e) => ({ type: e.type, id: e.id })),
  };
  if (isDemoValue(p.isDemo)) out.isDemo = true;
  if (isArchivedValue(p.archived)) out.archived = true;
  return out;
}

function readWorkspace() {
  const stages = Array.isArray(store.stages) && store.stages.length
    ? store.stages.slice()
    : DEFAULT_STAGES.slice();
  const projects = (store.projects || []).map(projectToApi);
  return { stages, projects };
}

function uniqueProjectId() {
  return newId();
}

function uniqueCardId() {
  return newId();
}

function uniqueItemId() {
  return newId();
}

function uniqueTimelogId() {
  return newId();
}

function writeProject(projectId, patch) {
  const p = findProject(projectId);
  if (!p) return false;
  if (patch.name != null) p.name = patch.name;
  if (patch.color != null) p.color = patch.color;
  if (patch.cover) {
    const desc =
      patch.cover.values && patch.cover.values.description != null
        ? String(patch.cover.values.description)
        : p.description || "";
    p.description = desc;
  }
  const demo = patch.isDemo != null ? patch.isDemo : p.isDemo;
  if (isDemoValue(demo)) p.isDemo = true;
  else delete p.isDemo;
  return true;
}

function createProject({ name, color, cover }) {
  const title = String(name || "").trim() || "Untitled";
  const id = uniqueProjectId();
  const description =
    cover && cover.values && cover.values.description != null
      ? String(cover.values.description)
      : "";
  const project = {
    id,
    name: title,
    color: color || "#3c3c40",
    description,
    boards: [],
    databases: [],
    notesTabs: [],
    filesTabs: [],
  };
  store.projects.push(project);
  return id;
}

function softDeleteProject(projectId) {
  if (!projectId || projectId.includes("..") || projectId.includes("/") || projectId.includes("\\")) {
    return false;
  }
  const idx = store.projects.findIndex((p) => p.id === projectId);
  if (idx < 0) return false;
  const [project] = store.projects.splice(idx, 1);
  ensureTrash();
  const entry = {
    kind: "project",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: project.id,
    projectName: project.name || project.id,
    color: project.color || "#3c3c40",
    title: project.name || project.id,
    snapshot: deepClone(project),
  };
  if (isDemoValue(project.isDemo)) entry.isDemo = true;
  store.trash.push(entry);
  return true;
}

function syncTimelogCardTitle(projectId, boardId, cardId, title) {
  if (!cardId || title == null) return;
  const next = String(title).trim() || "Untitled";
  for (const t of store.timelogs || []) {
    if (
      t.project === projectId &&
      t.board === boardId &&
      t.card === cardId &&
      t.title !== next
    ) {
      t.title = next;
    }
  }
}

/** Draft card attachments / RTE images before the card row exists. key = project\\0board\\0card */
const pendingCardFiles = new Map();
const pendingCardImages = new Map();

function pendingCardFilesKey(projectId, boardId, cardId) {
  return `${projectId}\0${boardId}\0${cardId}`;
}

function normalizeCardFiles(files) {
  if (!Array.isArray(files)) return [];
  const out = [];
  const seen = new Set();
  for (const f of files) {
    if (!f || typeof f !== "object") continue;
    const id = String(f.id || "").trim();
    if (!id || !isSafePathId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(f.name || id).trim() || id,
      mime: String(f.mime || "application/octet-stream").slice(0, 200),
      size: Number(f.size) || 0,
      createdAt: f.createdAt || new Date().toISOString(),
    });
  }
  return out;
}

function findCardRecord(projectId, boardId, cardId) {
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board || !board.cards) return null;
  return board.cards.find((c) => c.id === cardId) || null;
}

function listCardFiles(projectId, boardId, cardId) {
  const card = findCardRecord(projectId, boardId, cardId);
  if (card) return normalizeCardFiles(card.files);
  const pending = pendingCardFiles.get(pendingCardFilesKey(projectId, boardId, cardId));
  return normalizeCardFiles(pending);
}

function setCardFilesList(projectId, boardId, cardId, files) {
  const next = normalizeCardFiles(files);
  const card = findCardRecord(projectId, boardId, cardId);
  if (card) {
    if (next.length) card.files = next;
    else delete card.files;
    return next;
  }
  const key = pendingCardFilesKey(projectId, boardId, cardId);
  if (next.length) pendingCardFiles.set(key, next);
  else pendingCardFiles.delete(key);
  return next;
}

function takePendingCardFiles(projectId, boardId, cardId) {
  const key = pendingCardFilesKey(projectId, boardId, cardId);
  const files = normalizeCardFiles(pendingCardFiles.get(key));
  pendingCardFiles.delete(key);
  return files;
}

function clearPendingCardFiles(projectId, boardId, cardId) {
  pendingCardFiles.delete(pendingCardFilesKey(projectId, boardId, cardId));
}

function listCardImages(projectId, boardId, cardId) {
  const card = findCardRecord(projectId, boardId, cardId);
  if (card) return normalizeCardFiles(card.images);
  const pending = pendingCardImages.get(pendingCardFilesKey(projectId, boardId, cardId));
  return normalizeCardFiles(pending);
}

function setCardImagesList(projectId, boardId, cardId, files) {
  const next = normalizeCardFiles(files);
  const card = findCardRecord(projectId, boardId, cardId);
  if (card) {
    if (next.length) card.images = next;
    else delete card.images;
    return next;
  }
  const key = pendingCardFilesKey(projectId, boardId, cardId);
  if (next.length) pendingCardImages.set(key, next);
  else pendingCardImages.delete(key);
  return next;
}

function takePendingCardImages(projectId, boardId, cardId) {
  const key = pendingCardFilesKey(projectId, boardId, cardId);
  const files = normalizeCardFiles(pendingCardImages.get(key));
  pendingCardImages.delete(key);
  return files;
}

function clearPendingCardImages(projectId, boardId, cardId) {
  pendingCardImages.delete(pendingCardFilesKey(projectId, boardId, cardId));
}

function uniqueCardFileId() {
  return newId();
}

function purgeCardFileBlobs(projectId, boardId, files) {
  if (!isSafePathId(projectId) || !isSafePathId(boardId)) return;
  for (const f of normalizeCardFiles(files)) {
    userData.unlinkUpload(projectId, boardId, f.id);
  }
}

function addCardFile(projectId, boardId, cardId, { name, mime, data }) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board) return { ok: false, error: "board not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  let buf;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "invalid data" };
  }
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const files = listCardFiles(projectId, boardId, cardId);
  const id = uniqueCardFileId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  userData.writeUpload(projectId, boardId, id, buf);
  const meta = {
    id,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  };
  files.push(meta);
  setCardFilesList(projectId, boardId, cardId, files);
  return { ok: true, file: meta, files };
}

function deleteCardFile(projectId, boardId, cardId, fileId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const files = listCardFiles(projectId, boardId, cardId);
  const idx = files.findIndex((f) => f.id === fileId);
  if (idx < 0) return { ok: false, error: "file not found" };
  files.splice(idx, 1);
  setCardFilesList(projectId, boardId, cardId, files);
  userData.unlinkUpload(projectId, boardId, fileId);
  return { ok: true, files };
}

function discardCardFiles(projectId, boardId, cardId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const card = findCardRecord(projectId, boardId, cardId);
  if (card) return { ok: false, error: "card exists" };
  const files = listCardFiles(projectId, boardId, cardId);
  purgeCardFileBlobs(projectId, boardId, files);
  clearPendingCardFiles(projectId, boardId, cardId);
  const images = listCardImages(projectId, boardId, cardId);
  purgeRteImageBlobs(projectId, boardId, images);
  clearPendingCardImages(projectId, boardId, cardId);
  return { ok: true };
}

function readCardFileBytes(projectId, boardId, cardId, fileId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const meta = listCardFiles(projectId, boardId, cardId).find((f) => f.id === fileId);
  if (!meta) return { ok: false, error: "file not found" };
  const body = userData.readUpload(projectId, boardId, fileId);
  if (!body) return { ok: false, error: "file not found" };
  return {
    ok: true,
    name: meta.name || fileId,
    mime: meta.mime || "application/octet-stream",
    body,
  };
}

  /** Move card attachment blobs between tab folders (board id = folder). */
function moveCardFileBlobs(fromProject, fromBoard, toProject, toBoard, files) {
  if (fromProject === toProject && fromBoard === toBoard) return { ok: true };
  if (
    !isSafePathId(fromProject) ||
    !isSafePathId(fromBoard) ||
    !isSafePathId(toProject) ||
    !isSafePathId(toBoard)
  ) {
    return { ok: false, error: "invalid path" };
  }
  for (const f of normalizeCardFiles(files)) {
    const moved = userData.moveUpload(
      fromProject,
      fromBoard,
      f.id,
      toProject,
      toBoard,
      f.id
    );
    if (!moved.ok) return moved;
  }
  return { ok: true };
}

function isAllowedRteImageMime(mime, name) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"].includes(ext);
}

function findNoteRecord(projectId, notesTabId, noteId) {
  const project = findProject(projectId);
  const tab = findNotesTab(project, notesTabId);
  if (!project || !tab || !tab.notes) return null;
  return tab.notes.find((n) => n.id === noteId) || null;
}

function listNoteImages(projectId, notesTabId, noteId) {
  const note = findNoteRecord(projectId, notesTabId, noteId);
  return normalizeCardFiles(note && note.images);
}

function setNoteImagesList(projectId, notesTabId, noteId, files) {
  const note = findNoteRecord(projectId, notesTabId, noteId);
  if (!note) return null;
  const next = normalizeCardFiles(files);
  if (next.length) note.images = next;
  else delete note.images;
  return next;
}

function listCoverImages(projectId) {
  const project = findProject(projectId);
  return normalizeCardFiles(project && project.coverImages);
}

function setCoverImagesList(projectId, files) {
  const project = findProject(projectId);
  if (!project) return null;
  const next = normalizeCardFiles(files);
  if (next.length) project.coverImages = next;
  else delete project.coverImages;
  return next;
}

function purgeRteImageBlobs(projectId, tabId, files) {
  if (!isSafePathId(projectId) || !isSafePathId(tabId)) return;
  for (const f of normalizeCardFiles(files)) {
    userData.unlinkUpload(projectId, tabId, f.id);
  }
}

function moveRteImageBlobs(fromProject, fromTab, toProject, toTab, files) {
  if (fromProject === toProject && fromTab === toTab) return { ok: true };
  if (
    !isSafePathId(fromProject) ||
    !isSafePathId(fromTab) ||
    !isSafePathId(toProject) ||
    !isSafePathId(toTab)
  ) {
    return { ok: false, error: "invalid path" };
  }
  for (const f of normalizeCardFiles(files)) {
    const moved = userData.moveUpload(
      fromProject,
      fromTab,
      f.id,
      toProject,
      toTab,
      f.id
    );
    if (!moved.ok) return moved;
  }
  return { ok: true };
}

function rewriteNoteRteImageUrls(
  html,
  { fromProject, fromTab, fromNote, toProject, toTab, toNote }
) {
  if (!html) return html || "";
  return String(html).replace(/\/api\/rte-image\?([^"'>\s]+)/g, (full, qs) => {
    let params;
    try {
      params = new URLSearchParams(qs);
    } catch {
      return full;
    }
    if (params.get("scope") !== "note") return full;
    if (params.get("project") !== fromProject) return full;
    if (params.get("notesTab") !== fromTab) return full;
    if (params.get("note") !== fromNote) return full;
    params.set("project", toProject);
    params.set("notesTab", toTab);
    params.set("note", toNote);
    return `/api/rte-image?${params.toString()}`;
  });
}

function addNoteRteImage(projectId, notesTabId, noteId, { name, mime, data }) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(notesTabId) ||
    !isSafePathId(noteId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const note = findNoteRecord(projectId, notesTabId, noteId);
  if (!note) return { ok: false, error: "note not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (!isAllowedRteImageMime(mime, fileName)) {
    return { ok: false, error: "not an image" };
  }
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  let buf;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "invalid data" };
  }
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  userData.writeUpload(projectId, notesTabId, id, buf);
  const meta = {
    id,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  };
  const images = listNoteImages(projectId, notesTabId, noteId);
  images.push(meta);
  setNoteImagesList(projectId, notesTabId, noteId, images);
  return { ok: true, file: meta, images, tabId: notesTabId };
}

function addCoverRteImage(projectId, { name, mime, data }) {
  if (!isSafePathId(projectId)) return { ok: false, error: "invalid path" };
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (!isAllowedRteImageMime(mime, fileName)) {
    return { ok: false, error: "not an image" };
  }
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  let buf;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "invalid data" };
  }
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  userData.writeUpload(projectId, COVER_TAB_ID, id, buf);
  const meta = {
    id,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  };
  const images = listCoverImages(projectId);
  images.push(meta);
  setCoverImagesList(projectId, images);
  return { ok: true, file: meta, images, tabId: COVER_TAB_ID };
}

function readNoteRteImage(projectId, notesTabId, noteId, fileId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(notesTabId) ||
    !isSafePathId(noteId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const meta = listNoteImages(projectId, notesTabId, noteId).find((f) => f.id === fileId);
  if (!meta) return { ok: false, error: "file not found" };
  const body = userData.readUpload(projectId, notesTabId, fileId);
  if (!body) return { ok: false, error: "file not found" };
  return {
    ok: true,
    name: meta.name || fileId,
    mime: meta.mime || "application/octet-stream",
    body,
  };
}

function readCoverRteImage(projectId, fileId) {
  if (!isSafePathId(projectId) || !isSafePathId(fileId)) {
    return { ok: false, error: "invalid path" };
  }
  const meta = listCoverImages(projectId).find((f) => f.id === fileId);
  if (!meta) return { ok: false, error: "file not found" };
  const body = userData.readUpload(projectId, COVER_TAB_ID, fileId);
  if (!body) return { ok: false, error: "file not found" };
  return {
    ok: true,
    name: meta.name || fileId,
    mime: meta.mime || "application/octet-stream",
    body,
  };
}

function deleteNoteRteImage(projectId, notesTabId, noteId, fileId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(notesTabId) ||
    !isSafePathId(noteId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const images = listNoteImages(projectId, notesTabId, noteId);
  const idx = images.findIndex((f) => f.id === fileId);
  if (idx < 0) return { ok: false, error: "file not found" };
  images.splice(idx, 1);
  setNoteImagesList(projectId, notesTabId, noteId, images);
  userData.unlinkUpload(projectId, notesTabId, fileId);
  return { ok: true, images };
}

function deleteCoverRteImage(projectId, fileId) {
  if (!isSafePathId(projectId) || !isSafePathId(fileId)) {
    return { ok: false, error: "invalid path" };
  }
  const images = listCoverImages(projectId);
  const idx = images.findIndex((f) => f.id === fileId);
  if (idx < 0) return { ok: false, error: "file not found" };
  images.splice(idx, 1);
  setCoverImagesList(projectId, images);
  userData.unlinkUpload(projectId, COVER_TAB_ID, fileId);
  return { ok: true, images };
}

function addCardRteImage(projectId, boardId, cardId, { name, mime, data }) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board) return { ok: false, error: "board not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (!isAllowedRteImageMime(mime, fileName)) {
    return { ok: false, error: "not an image" };
  }
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  let buf;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "invalid data" };
  }
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  userData.writeUpload(projectId, boardId, id, buf);
  const meta = {
    id,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  };
  const images = listCardImages(projectId, boardId, cardId);
  images.push(meta);
  setCardImagesList(projectId, boardId, cardId, images);
  return { ok: true, file: meta, images, tabId: boardId };
}

function readCardRteImage(projectId, boardId, cardId, fileId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const meta = listCardImages(projectId, boardId, cardId).find((f) => f.id === fileId);
  if (!meta) return { ok: false, error: "file not found" };
  const body = userData.readUpload(projectId, boardId, fileId);
  if (!body) return { ok: false, error: "file not found" };
  return {
    ok: true,
    name: meta.name || fileId,
    mime: meta.mime || "application/octet-stream",
    body,
  };
}

function deleteCardRteImage(projectId, boardId, cardId, fileId) {
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(boardId) ||
    !isSafePathId(cardId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const images = listCardImages(projectId, boardId, cardId);
  const idx = images.findIndex((f) => f.id === fileId);
  if (idx < 0) return { ok: false, error: "file not found" };
  images.splice(idx, 1);
  setCardImagesList(projectId, boardId, cardId, images);
  userData.unlinkUpload(projectId, boardId, fileId);
  return { ok: true, images };
}

function writeCard(projectId, boardId, card) {
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board) throw new Error("board not found");
  if (!board.cards) board.cards = [];
  const id = card.id || newId();
  let existing = board.cards.find((c) => c.id === id);
  const isNew = !existing;
  if (!existing) {
    existing = { id };
    board.cards.push(existing);
  }
  existing.title = card.title || id;
  existing.status = card.status || DEFAULT_BOARD_COLS[0];
  existing.master = card.master || "Backlog";
  existing.body = card.body || "";
  if (card.doneAt) existing.doneAt = card.doneAt;
  else delete existing.doneAt;
  applyCardMeta(existing, card);
  if (card.ord != null && card.ord !== "" && !Number.isNaN(Number(card.ord))) {
    existing.ord = Number(card.ord);
  } else if (isNew) {
    let maxOrd = -1;
    for (const c of board.cards) {
      if (c === existing) continue;
      const n = Number(c.ord);
      if (!Number.isNaN(n)) maxOrd = Math.max(maxOrd, n);
    }
    existing.ord = maxOrd + 1;
  }
  if (card.files != null) {
    const files = normalizeCardFiles(card.files);
    if (files.length) existing.files = files;
    else delete existing.files;
  } else if (isNew) {
    const pending = takePendingCardFiles(projectId, boardId, id);
    if (pending.length) existing.files = pending;
  }
  if (card.images != null) {
    const images = normalizeCardFiles(card.images);
    if (images.length) existing.images = images;
    else delete existing.images;
  } else if (isNew) {
    const pendingImages = takePendingCardImages(projectId, boardId, id);
    if (pendingImages.length) existing.images = pendingImages;
  }
  const demo = card.isDemo != null ? card.isDemo : existing.isDemo;
  if (isDemoValue(demo)) existing.isDemo = true;
  else delete existing.isDemo;
  if (!isNew) syncTimelogCardTitle(projectId, boardId, id, existing.title);
  return id;
}

function writeCardOrder(items) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || !item.project || !item.board || !item.id) continue;
    if (projectIsArchived(item.project)) continue;
    const project = findProject(item.project);
    const board = findBoard(project, item.board);
    if (!project || !board || !board.cards) continue;
    const card = board.cards.find((c) => c.id === item.id);
    if (!card) continue;
    if (item.title != null) {
      card.title = item.title || card.title;
      syncTimelogCardTitle(item.project, item.board, item.id, card.title);
    }
    if (item.status != null) card.status = item.status;
    if (item.master != null) card.master = item.master;
    if (item.body != null) card.body = item.body;
    if (item.doneAt != null) {
      if (item.doneAt) card.doneAt = item.doneAt;
      else delete card.doneAt;
    }
    if (
      item.impact != null ||
      item.effort != null ||
      item.difficulty != null ||
      item.priority != null
    ) {
      applyCardMeta(card, {
        impact: item.impact != null ? item.impact : card.impact,
        effort:
          item.effort != null
            ? item.effort
            : item.difficulty != null
              ? item.difficulty
              : card.effort,
        priority: item.priority,
      });
    }
    if (item.ord != null && item.ord !== "" && !Number.isNaN(Number(item.ord))) {
      card.ord = Number(item.ord);
    }
  }
}

function ensureTrash() {
  if (!store.trash) store.trash = [];
  if (!Array.isArray(store.trash)) store.trash = [];
}

function uniqueTrashId() {
  return newId();
}

function softDeleteCard(projectId, boardId, cardId) {
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!board || !board.cards) return false;
  const idx = board.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return false;
  const [card] = board.cards.splice(idx, 1);
  ensureTrash();
  const entry = {
    kind: "card",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: projectId,
    board: boardId,
    card: card.id || "",
    title: card.title || card.id || "Untitled",
    status: card.status || "",
    master: card.master || "",
    body: card.body || "",
    doneAt: card.doneAt || "",
    projectName: project.name || projectId,
    boardName: board.name || boardId,
    color: project.color || "#3c3c40",
  };
  applyCardMeta(entry, card);
  const files = normalizeCardFiles(card.files);
  if (files.length) entry.files = files;
  const images = normalizeCardFiles(card.images);
  if (images.length) entry.images = images;
  if (isDemoValue(card.isDemo)) entry.isDemo = true;
  store.trash.push(entry);
  return true;
}

function softDeleteNote(projectId, notesTabId, noteId) {
  const project = findProject(projectId);
  const tab = findNotesTab(project, notesTabId);
  if (!project || !tab || !tab.notes) return false;
  const idx = tab.notes.findIndex((n) => n.id === noteId);
  if (idx < 0) return false;
  const [note] = tab.notes.splice(idx, 1);
  ensureTrash();
  const entry = {
    kind: "note",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: projectId,
    notesTab: notesTabId,
    note: note.id || "",
    title: note.title || note.id || "Untitled",
    body: note.body || "",
    createdAt: note.createdAt || "",
    updatedAt: note.updatedAt || "",
    projectName: project.name || projectId,
    notesTabName: tab.name || notesTabId,
    color: project.color || "#3c3c40",
  };
  if (note.pinned) entry.pinned = true;
  const images = normalizeCardFiles(note.images);
  if (images.length) entry.images = images;
  store.trash.push(entry);
  return true;
}

function softDeleteBoard(projectId, boardId) {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  const idx = (project.boards || []).findIndex((b) => b.id === boardId);
  if (idx < 0) return { ok: false, error: "tab not found" };
  const board = project.boards[idx];
  for (const card of [...(board.cards || [])]) {
    softDeleteCard(projectId, boardId, card.id);
  }
  ensureTrash();
  store.trash.push({
    kind: "board",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: projectId,
    board: board.id,
    boardName: board.name || board.id,
    columns: Array.isArray(board.columns) && board.columns.length
      ? board.columns.slice()
      : DEFAULT_BOARD_COLS.slice(),
    projectName: project.name || projectId,
    color: project.color || "#3c3c40",
    title: board.name || board.id,
  });
  if (isDemoValue(board.isDemo)) store.trash[store.trash.length - 1].isDemo = true;
  project.boards.splice(idx, 1);
  removeTabOrder(project, "board", boardId);
  return { ok: true };
}

function softDeleteNotesTab(projectId, notesTabId) {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  const idx = (project.notesTabs || []).findIndex((t) => t.id === notesTabId);
  if (idx < 0) return { ok: false, error: "tab not found" };
  const tab = project.notesTabs[idx];
  for (const note of [...(tab.notes || [])]) {
    softDeleteNote(projectId, notesTabId, note.id);
  }
  ensureTrash();
  store.trash.push({
    kind: "notesTab",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: projectId,
    notesTab: tab.id,
    notesTabName: tab.name || tab.id,
    projectName: project.name || projectId,
    color: project.color || "#3c3c40",
    title: tab.name || tab.id,
  });
  project.notesTabs.splice(idx, 1);
  removeTabOrder(project, "notes", notesTabId);
  return { ok: true };
}

function softDeleteUploadedFile(projectId, filesTabId, fileId) {
  const project = findProject(projectId);
  const tab = findFilesTab(project, filesTabId);
  if (!project || !tab || !tab.files) return { ok: false, error: "file not found" };
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(filesTabId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const idx = tab.files.findIndex((f) => f.id === fileId);
  if (idx < 0) return { ok: false, error: "file not found" };
  const [file] = tab.files.splice(idx, 1);
  ensureTrash();
  store.trash.push({
    kind: "file",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: projectId,
    filesTab: filesTabId,
    file: file.id || fileId,
    title: file.name || file.id || "Untitled",
    name: file.name || file.id || "Untitled",
    mime: file.mime || "application/octet-stream",
    size: Number(file.size) || 0,
    createdAt: file.createdAt || "",
    projectName: project.name || projectId,
    filesTabName: tab.name || filesTabId,
    color: project.color || "#3c3c40",
  });
  return { ok: true };
}

function softDeleteFilesTab(projectId, filesTabId) {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "project not found" };
  const idx = (project.filesTabs || []).findIndex((t) => t.id === filesTabId);
  if (idx < 0) return { ok: false, error: "tab not found" };
  const tab = project.filesTabs[idx];
  for (const file of [...(tab.files || [])]) {
    softDeleteUploadedFile(projectId, filesTabId, file.id);
  }
  ensureTrash();
  store.trash.push({
    kind: "filesTab",
    id: uniqueTrashId(),
    deletedAt: new Date().toISOString(),
    project: projectId,
    filesTab: tab.id,
    filesTabName: tab.name || tab.id,
    projectName: project.name || projectId,
    color: project.color || "#3c3c40",
    title: tab.name || tab.id,
  });
  project.filesTabs.splice(idx, 1);
  removeTabOrder(project, "files", filesTabId);
  return { ok: true };
}

function hardDeleteCard(projectId, boardId, cardId, { purgeFiles = true } = {}) {
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!board || !board.cards) return;
  const idx = board.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return;
  const [card] = board.cards.splice(idx, 1);
  if (purgeFiles) {
    purgeCardFileBlobs(projectId, boardId, card?.files);
    purgeRteImageBlobs(projectId, boardId, card?.images);
  }
  clearPendingCardFiles(projectId, boardId, cardId);
  clearPendingCardImages(projectId, boardId, cardId);
}

function deleteCard(projectId, boardId, cardId, { permanent = false, keepFiles = false } = {}) {
  if (permanent) return hardDeleteCard(projectId, boardId, cardId, { purgeFiles: !keepFiles });
  return softDeleteCard(projectId, boardId, cardId);
}

function findTrashParent(kind, projectId, containerId) {
  ensureTrash();
  if (kind === "project") {
    return (
      store.trash.find((t) => t.kind === "project" && t.project === projectId) || null
    );
  }
  if (kind === "board") {
    return (
      store.trash.find(
        (t) => t.kind === "board" && t.project === projectId && t.board === containerId
      ) || null
    );
  }
  if (kind === "notesTab") {
    return (
      store.trash.find(
        (t) =>
          t.kind === "notesTab" && t.project === projectId && t.notesTab === containerId
      ) || null
    );
  }
  if (kind === "filesTab") {
    return (
      store.trash.find(
        (t) =>
          t.kind === "filesTab" && t.project === projectId && t.filesTab === containerId
      ) || null
    );
  }
  return null;
}

function restoreProjectFromTrash(item) {
  if (!item || !item.snapshot || typeof item.snapshot !== "object") {
    return { ok: false, error: "invalid project snapshot" };
  }
  let project = deepClone(item.snapshot);
  let id = project.id || item.project || newId() || "project";
  if (findProject(id)) {
    id = uniqueProjectId();
  }
  project.id = id;
  if (!project.name) project.name = item.projectName || item.title || id;
  if (!store.projects) store.projects = [];
  store.projects.push(project);
  ensureTrash();
  const trashIdx = store.trash.findIndex((t) => t.id === item.id);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: id, id };
}

function restoreBoardFromTrash(item, { restoreParent = false } = {}) {
  let project = findProject(item.project);
  if (!project) {
    const parent = findTrashParent("project", item.project);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "project",
        parentName: parent.projectName || parent.title || item.project,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.id)) return { ok: false, error: "project is archived" };
  if (!project.boards) project.boards = [];
  let id = item.board || newId() || "board";
  if (findBoard(project, id)) {
    // already restored
    return { ok: true, project: project.id, board: id, id };
  }
  const cols = Array.isArray(item.columns) && item.columns.length
    ? item.columns.slice()
    : DEFAULT_BOARD_COLS.slice();
  project.boards.push({
    id,
    name: item.boardName || item.title || id,
    columns: cols,
    cards: [],
  });
  if (isDemoValue(item.isDemo)) project.boards[project.boards.length - 1].isDemo = true;
  appendTabOrder(project, "board", id);
  const trashIdx = store.trash.findIndex((t) => t.id === item.id);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: project.id, board: id, id };
}

function restoreNotesTabFromTrash(item, { restoreParent = false } = {}) {
  let project = findProject(item.project);
  if (!project) {
    const parent = findTrashParent("project", item.project);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "project",
        parentName: parent.projectName || parent.title || item.project,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.id)) return { ok: false, error: "project is archived" };
  if (!project.notesTabs) project.notesTabs = [];
  let id = item.notesTab || newId() || "notes";
  if (findNotesTab(project, id)) {
    return { ok: true, project: project.id, notesTab: id, id };
  }
  project.notesTabs.push({
    id,
    name: item.notesTabName || item.title || id,
    notes: [],
  });
  appendTabOrder(project, "notes", id);
  const trashIdx = store.trash.findIndex((t) => t.id === item.id);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: project.id, notesTab: id, id };
}

function restoreCardFromTrash(item, { restoreParent = false } = {}) {
  let project = findProject(item.project);
  if (!project) {
    const parent = findTrashParent("project", item.project);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "project",
        parentName: parent.projectName || parent.title || item.project,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.id)) return { ok: false, error: "project is archived" };
  let board = findBoard(project, item.board);
  if (!board) {
    const parent = findTrashParent("board", item.project, item.board);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "board",
        parentName: parent.boardName || parent.title || item.board,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreBoardFromTrash(parent);
      if (!restored.ok) return restored;
      board = findBoard(project, restored.board);
    }
  }
  if (!board) return { ok: false, error: "original board not found" };
  ensureTrash();
  const idx = store.trash.findIndex((t) => t.id === item.id);
  if (idx >= 0) store.trash.splice(idx, 1);
  if (!board.cards) board.cards = [];
  let id = item.card || newId() || "card";
  if (board.cards.some((c) => c.id === id)) id = uniqueCardId();
  const cols = Array.isArray(board.columns) && board.columns.length ? board.columns : DEFAULT_BOARD_COLS;
  const status = cols.includes(item.status) ? item.status : cols[0];
  const stages = Array.isArray(store.stages) && store.stages.length ? store.stages : DEFAULT_STAGES;
  const master = stages.includes(item.master) ? item.master : stages[0];
  const card = {
    id,
    title: item.title || id,
    status,
    master,
    body: item.body || "",
  };
  if (item.doneAt) card.doneAt = item.doneAt;
  applyCardMeta(card, item);
  const files = normalizeCardFiles(item.files);
  if (files.length) card.files = files;
  const images = normalizeCardFiles(item.images);
  if (images.length) card.images = images;
  if (isDemoValue(item.isDemo)) card.isDemo = true;
  board.cards.push(card);
  return { ok: true, project: project.id, board: board.id || item.board, id };
}

function restoreNoteFromTrash(item, { restoreParent = false } = {}) {
  let project = findProject(item.project);
  if (!project) {
    const parent = findTrashParent("project", item.project);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "project",
        parentName: parent.projectName || parent.title || item.project,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.id)) return { ok: false, error: "project is archived" };
  let tab = findNotesTab(project, item.notesTab);
  if (!tab) {
    const parent = findTrashParent("notesTab", item.project, item.notesTab);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "notesTab",
        parentName: parent.notesTabName || parent.title || item.notesTab,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreNotesTabFromTrash(parent);
      if (!restored.ok) return restored;
      tab = findNotesTab(project, restored.notesTab);
    }
  }
  if (!tab) return { ok: false, error: "original notes tab not found" };
  ensureTrash();
  const idx = store.trash.findIndex((t) => t.id === item.id);
  if (idx >= 0) store.trash.splice(idx, 1);
  if (!tab.notes) tab.notes = [];
  let id = item.note || newId() || "note";
  if (tab.notes.some((n) => n.id === id)) id = uniqueNoteId();
  const now = new Date().toISOString();
  const restored = {
    id,
    title: item.title || id,
    body: item.body || "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  };
  if (item.pinned) restored.pinned = true;
  const images = normalizeCardFiles(item.images);
  if (images.length) restored.images = images;
  tab.notes.push(restored);
  return { ok: true, project: project.id, notesTab: tab.id || item.notesTab, id };
}

function restoreFilesTabFromTrash(item, { restoreParent = false } = {}) {
  let project = findProject(item.project);
  if (!project) {
    const parent = findTrashParent("project", item.project);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "project",
        parentName: parent.projectName || parent.title || item.project,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.id)) return { ok: false, error: "project is archived" };
  if (!project.filesTabs) project.filesTabs = [];
  let id = item.filesTab || newId() || "files";
  if (findFilesTab(project, id)) {
    return { ok: true, project: project.id, filesTab: id, id };
  }
  project.filesTabs.push({
    id,
    name: item.filesTabName || item.title || id,
    files: [],
  });
  appendTabOrder(project, "files", id);
  const trashIdx = store.trash.findIndex((t) => t.id === item.id);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: project.id, filesTab: id, id };
}

function restoreFileFromTrash(item, { restoreParent = false } = {}) {
  let project = findProject(item.project);
  if (!project) {
    const parent = findTrashParent("project", item.project);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "project",
        parentName: parent.projectName || parent.title || item.project,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.id)) return { ok: false, error: "project is archived" };
  let tab = findFilesTab(project, item.filesTab);
  if (!tab) {
    const parent = findTrashParent("filesTab", item.project, item.filesTab);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "filesTab",
        parentName: parent.filesTabName || parent.title || item.filesTab,
        parentTrashId: parent.id,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreFilesTabFromTrash(parent);
      if (!restored.ok) return restored;
      tab = findFilesTab(project, restored.filesTab);
    }
  }
  if (!tab) return { ok: false, error: "original files tab not found" };
  const fileId = item.file || "";
  if (
    !isSafePathId(project.id) ||
    !isSafePathId(tab.id || item.filesTab) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  if (!userData.uploadExists(project.id, tab.id || item.filesTab, fileId)) {
    return { ok: false, error: "file data missing" };
  }
  ensureTrash();
  const idx = store.trash.findIndex((t) => t.id === item.id);
  if (idx >= 0) store.trash.splice(idx, 1);
  if (!tab.files) tab.files = [];
  let id = fileId;
  if (tab.files.some((f) => f.id === id)) id = uniqueFileId();
  if (id !== fileId) {
    const moved = userData.moveUpload(
      project.id,
      tab.id || item.filesTab,
      fileId,
      project.id,
      tab.id || item.filesTab,
      id
    );
    if (!moved?.ok) return { ok: false, error: "file data missing" };
  }
  tab.files.push({
    id,
    name: item.name || item.title || id,
    mime: item.mime || "application/octet-stream",
    size: Number(item.size) || 0,
    createdAt: item.createdAt || new Date().toISOString(),
  });
  return { ok: true, project: project.id, filesTab: tab.id || item.filesTab, id };
}

function readTrash() {
  ensureTrash();
  return store.trash
    .slice()
    .sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")))
    .map((t) => {
      const kind = t.kind || "card";
      const base = {
        kind,
        id: t.id,
        deletedAt: t.deletedAt || "",
        project: t.project || "",
        projectName: t.projectName || t.project || "",
        color: t.color || "#3c3c40",
        isDemo: isDemoValue(t.isDemo) || undefined,
      };
      if (kind === "note") {
        return {
          ...base,
          notesTab: t.notesTab || "",
          notesTabName: t.notesTabName || t.notesTab || "",
          note: t.note || "",
          title: t.title || t.note || "Untitled",
          body: t.body || "",
        };
      }
      if (kind === "project") {
        return {
          ...base,
          title: t.projectName || t.title || t.project || "Project",
        };
      }
      if (kind === "board") {
        return {
          ...base,
          board: t.board || "",
          boardName: t.boardName || t.board || "",
          title: t.boardName || t.title || t.board || "Board",
          columns: Array.isArray(t.columns) ? t.columns.slice() : [],
        };
      }
      if (kind === "notesTab") {
        return {
          ...base,
          notesTab: t.notesTab || "",
          notesTabName: t.notesTabName || t.notesTab || "",
          title: t.notesTabName || t.title || t.notesTab || "Notes",
        };
      }
      if (kind === "filesTab") {
        return {
          ...base,
          filesTab: t.filesTab || "",
          filesTabName: t.filesTabName || t.filesTab || "",
          title: t.filesTabName || t.title || t.filesTab || "Files",
        };
      }
      if (kind === "file") {
        return {
          ...base,
          filesTab: t.filesTab || "",
          filesTabName: t.filesTabName || t.filesTab || "",
          file: t.file || "",
          title: t.title || t.name || t.file || "Untitled",
          name: t.name || t.title || t.file || "Untitled",
          mime: t.mime || "application/octet-stream",
          size: Number(t.size) || 0,
        };
      }
      const card = {
        ...base,
        board: t.board || "",
        card: t.card || "",
        title: t.title || t.card || "Untitled",
        status: t.status || "",
        master: t.master || "",
        body: t.body || "",
        doneAt: t.doneAt || "",
        boardName: t.boardName || t.board || "",
      };
      applyCardMeta(card, t);
      return card;
    });
}

function restoreTrashItem(trashId, { restoreParent = false } = {}) {
  ensureTrash();
  const idx = store.trash.findIndex((t) => t.id === trashId);
  if (idx < 0) return { ok: false, error: "not found" };
  const item = store.trash[idx];
  const kind = item.kind || "card";
  if (kind === "project") return restoreProjectFromTrash(item);
  if (kind === "board") return restoreBoardFromTrash(item, { restoreParent });
  if (kind === "notesTab") return restoreNotesTabFromTrash(item, { restoreParent });
  if (kind === "filesTab") return restoreFilesTabFromTrash(item, { restoreParent });
  if (kind === "note") return restoreNoteFromTrash(item, { restoreParent });
  if (kind === "file") return restoreFileFromTrash(item, { restoreParent });
  return restoreCardFromTrash(item, { restoreParent });
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function purgeExpiredTrash() {
  ensureTrash();
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const before = store.trash.length;
  const kept = [];
  for (const item of store.trash) {
    const t = Date.parse(item.deletedAt);
    if (Number.isFinite(t) && t >= cutoff) {
      kept.push(item);
      continue;
    }
    if (item && item.kind === "card") {
      purgeCardFileBlobs(item.project, item.board, item.files);
      purgeRteImageBlobs(item.project, item.board, item.images);
    } else if (item && item.kind === "note") {
      purgeRteImageBlobs(item.project, item.notesTab, item.images);
    } else if (item && item.kind === "project" && item.snapshot) {
      purgeRteImageBlobs(item.project, COVER_TAB_ID, item.snapshot.coverImages);
      for (const tab of item.snapshot.notesTabs || []) {
        for (const note of tab.notes || []) {
          purgeRteImageBlobs(item.project, tab.id, note.images);
        }
      }
      for (const board of item.snapshot.boards || []) {
        for (const card of board.cards || []) {
          purgeCardFileBlobs(item.project, board.id, card.files);
          purgeRteImageBlobs(item.project, board.id, card.images);
        }
      }
    } else if (
      item &&
      item.kind === "file" &&
      isSafePathId(item.project) &&
      isSafePathId(item.filesTab) &&
      isSafePathId(item.file)
    ) {
      userData.unlinkUpload(item.project, item.filesTab, item.file);
    }
  }
  store.trash = kept;
  return before - store.trash.length;
}

function createBoard(projectId, name) {
  const project = findProject(projectId);
  if (!project) throw new Error("project not found");
  if (!project.boards) project.boards = [];
  const bId = newId();
  project.boards.push({
    id: bId,
    name,
    columns: DEFAULT_BOARD_COLS.slice(),
    cards: [],
  });
  appendTabOrder(project, "board", bId);
  return bId;
}

function writeBoard(projectId, boardId, { name, columns, isDemo }) {
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board) throw new Error("board not found");
  const cols = normalizeColumns(columns);
  board.name = name || board.name || boardId;
  board.columns = cols.length ? cols : DEFAULT_BOARD_COLS.slice();
  const demo = isDemo != null ? isDemo : board.isDemo;
  if (isDemoValue(demo)) board.isDemo = true;
  else delete board.isDemo;
}

function renameBoardStatuses(projectId, boardId, from, to) {
  if (!from || !to || from === to) return;
  const board = findBoard(findProject(projectId), boardId);
  if (!board || !board.cards) return;
  for (const card of board.cards) {
    if (card.status === from) card.status = to;
  }
}

function renameAcrossBoards(from, to) {
  if (!from || !to || from === to) return;
  for (const project of store.projects || []) {
    for (const board of project.boards || []) {
      for (const card of board.cards || []) {
        if (card.master === from) card.master = to;
      }
    }
  }
}

function writeWorkspaceMeta({ stages }) {
  const cols = normalizeColumns(stages);
  store.stages = cols.length ? cols : DEFAULT_STAGES.slice();
}

function loadDbColumns(projectId, databaseId) {
  const db = findDatabase(findProject(projectId), databaseId);
  return normalizeDbColumns(db && db.columns);
}

function writeDatabase(projectId, databaseId, { name, columns, customViews, customViewId }) {
  const project = findProject(projectId);
  if (!project) throw new Error("project not found");
  if (!project.databases) project.databases = [];
  let db = findDatabase(project, databaseId);
  if (!db) {
    db = {
      id: databaseId,
      name: name || databaseId,
      columns: [],
      items: [],
      customViews: normalizeCustomViews(null),
      customViewId: DEFAULT_CUSTOM_VIEW_ID,
    };
    project.databases.push(db);
  }
  db.name = name || db.name || databaseId;
  if (columns !== undefined) db.columns = normalizeDbColumns(columns);
  else if (!db.columns || !db.columns.length) db.columns = normalizeDbColumns(null);
  if (customViews !== undefined) db.customViews = normalizeCustomViews(customViews);
  else db.customViews = normalizeCustomViews(db.customViews);
  db.customViewId = resolveCustomViewId(
    customViewId !== undefined ? customViewId : db.customViewId,
    db.customViews
  );
  if (!db.items) db.items = [];
}

function createDatabase(projectId, name) {
  const project = findProject(projectId);
  const dId = newId();
  writeDatabase(projectId, dId, {
    name,
    columns: DEFAULT_DB_COLS,
    customViews: normalizeCustomViews(null),
    customViewId: DEFAULT_CUSTOM_VIEW_ID,
  });
  if (project) appendTabOrder(project, "database", dId);
  return dId;
}

function uniqueNoteId() {
  return newId();
}

function createNotesTab(projectId, name) {
  const project = findProject(projectId);
  if (!project) throw new Error("project not found");
  if (!project.notesTabs) project.notesTabs = [];
  const tabId = newId();
  project.notesTabs.push({ id: tabId, name, notes: [] });
  appendTabOrder(project, "notes", tabId);
  return tabId;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function createFilesTab(projectId, name) {
  const project = findProject(projectId);
  if (!project) throw new Error("project not found");
  if (!project.filesTabs) project.filesTabs = [];
  const tabId = newId();
  project.filesTabs.push({ id: tabId, name, files: [] });
  appendTabOrder(project, "files", tabId);
  return tabId;
}

function uniqueFileId() {
  return newId();
}

function addUploadedFile(projectId, filesTabId, { name, mime, data }) {
  const project = findProject(projectId);
  const tab = findFilesTab(project, filesTabId);
  if (!project || !tab) return { ok: false, error: "files tab not found" };
  if (!isSafePathId(projectId) || !isSafePathId(filesTabId)) {
    return { ok: false, error: "invalid path" };
  }
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  let buf;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "invalid data" };
  }
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  if (!tab.files) tab.files = [];
  const id = uniqueFileId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  userData.writeUpload(projectId, filesTabId, id, buf);
  tab.files.push({
    id,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, id };
}

function deleteUploadedFile(projectId, filesTabId, fileId) {
  return softDeleteUploadedFile(projectId, filesTabId, fileId);
}

function renameUploadedFile(projectId, filesTabId, fileId, name) {
  const project = findProject(projectId);
  const tab = findFilesTab(project, filesTabId);
  if (!project || !tab || !tab.files) return { ok: false, error: "file not found" };
  const meta = tab.files.find((f) => f.id === fileId);
  if (!meta) return { ok: false, error: "file not found" };
  const title = String(name || "").trim();
  if (!title) return { ok: false, error: "missing fields" };
  meta.name = title;
  return { ok: true };
}

function moveUploadedFile(fromProjectId, fromTabId, fileId, toProjectId, toTabId) {
  if (projectIsArchived(fromProjectId) || projectIsArchived(toProjectId)) {
    return { ok: false, error: "project is archived" };
  }
  if (fromProjectId === toProjectId && fromTabId === toTabId) {
    return { ok: false, error: "same destination" };
  }
  if (
    !isSafePathId(fromProjectId) ||
    !isSafePathId(fromTabId) ||
    !isSafePathId(fileId) ||
    !isSafePathId(toProjectId) ||
    !isSafePathId(toTabId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const fromProject = findProject(fromProjectId);
  const fromTab = findFilesTab(fromProject, fromTabId);
  const toProject = findProject(toProjectId);
  const toTab = findFilesTab(toProject, toTabId);
  if (!fromProject || !fromTab || !fromTab.files) return { ok: false, error: "file not found" };
  if (!toProject || !toTab) return { ok: false, error: "destination not found" };
  const idx = fromTab.files.findIndex((f) => f.id === fileId);
  if (idx < 0) return { ok: false, error: "file not found" };
  if (!userData.uploadExists(fromProjectId, fromTabId, fileId)) {
    return { ok: false, error: "file not found" };
  }
  if (!toTab.files) toTab.files = [];
  let id = fileId;
  if (toTab.files.some((f) => f.id === id)) {
    id = uniqueFileId();
  }
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  const moved = userData.moveUpload(
    fromProjectId,
    fromTabId,
    fileId,
    toProjectId,
    toTabId,
    id
  );
  if (!moved.ok) return moved;
  const [meta] = fromTab.files.splice(idx, 1);
  toTab.files.push({
    id,
    name: meta.name || id,
    mime: meta.mime || "application/octet-stream",
    size: Number(meta.size) || 0,
    createdAt: meta.createdAt || new Date().toISOString(),
  });
  return { ok: true, id, project: toProjectId, filesTab: toTabId };
}

function readUploadedFile(projectId, filesTabId, fileId) {
  const project = findProject(projectId);
  const tab = findFilesTab(project, filesTabId);
  if (!project || !tab || !tab.files) return { ok: false, error: "file not found" };
  if (
    !isSafePathId(projectId) ||
    !isSafePathId(filesTabId) ||
    !isSafePathId(fileId)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const meta = tab.files.find((f) => f.id === fileId);
  if (!meta) return { ok: false, error: "file not found" };
  const body = userData.readUpload(projectId, filesTabId, fileId);
  if (!body) return { ok: false, error: "file not found" };
  return {
    ok: true,
    name: meta.name || fileId,
    mime: meta.mime || "application/octet-stream",
    body,
  };
}

function writeNote(projectId, notesTabId, { id, title, body, pinned }) {
  const project = findProject(projectId);
  const tab = findNotesTab(project, notesTabId);
  if (!project || !tab) throw new Error("notes tab not found");
  if (!tab.notes) tab.notes = [];
  const now = new Date().toISOString();
  let note = tab.notes.find((n) => n.id === id);
  if (!note) {
    note = {
      id,
      title: title || id,
      body: body || "",
      createdAt: now,
      updatedAt: now,
    };
    if (pinned) note.pinned = true;
    tab.notes.push(note);
  } else {
    let contentChanged = false;
    if (title != null) {
      note.title = String(title).trim() || note.title || id;
      contentChanged = true;
    }
    if (body != null) {
      note.body = String(body);
      contentChanged = true;
    }
    if (pinned != null) {
      if (pinned) note.pinned = true;
      else delete note.pinned;
    }
    if (!note.createdAt) note.createdAt = note.updatedAt || now;
    if (contentChanged) note.updatedAt = now;
  }
  return id;
}

function deleteNote(projectId, notesTabId, noteId) {
  if (!softDeleteNote(projectId, notesTabId, noteId)) {
    return { ok: false, error: "note not found" };
  }
  return { ok: true };
}

function moveNote(fromProjectId, fromTabId, noteId, toProjectId, toTabId) {
  if (projectIsArchived(fromProjectId) || projectIsArchived(toProjectId)) {
    return { ok: false, error: "project is archived" };
  }
  if (
    fromProjectId === toProjectId &&
    fromTabId === toTabId
  ) {
    return { ok: false, error: "same destination" };
  }
  const fromProject = findProject(fromProjectId);
  const fromTab = findNotesTab(fromProject, fromTabId);
  const toProject = findProject(toProjectId);
  const toTab = findNotesTab(toProject, toTabId);
  if (!fromProject || !fromTab) return { ok: false, error: "note not found" };
  if (!toProject || !toTab) return { ok: false, error: "destination not found" };
  if (!fromTab.notes) return { ok: false, error: "note not found" };
  const idx = fromTab.notes.findIndex((n) => n.id === noteId);
  if (idx < 0) return { ok: false, error: "note not found" };
  const [note] = fromTab.notes.splice(idx, 1);
  if (!toTab.notes) toTab.notes = [];
  let id = note.id || newId() || "note";
  if (toTab.notes.some((n) => n.id === id)) {
    id = uniqueNoteId();
  }
  const images = normalizeCardFiles(note.images);
  if (images.length) {
    const moved = moveRteImageBlobs(
      fromProjectId,
      fromTabId,
      toProjectId,
      toTabId,
      images
    );
    if (!moved.ok) {
      fromTab.notes.splice(idx, 0, note);
      return moved;
    }
  }
  const now = new Date().toISOString();
  const body = rewriteNoteRteImageUrls(note.body || "", {
    fromProject: fromProjectId,
    fromTab: fromTabId,
    fromNote: note.id || noteId,
    toProject: toProjectId,
    toTab: toTabId,
    toNote: id,
  });
  const movedNote = {
    id,
    title: note.title || id,
    body,
    createdAt: note.createdAt || note.updatedAt || now,
    updatedAt: now,
  };
  if (note.pinned) movedNote.pinned = true;
  if (images.length) movedNote.images = images;
  toTab.notes.push(movedNote);
  return {
    ok: true,
    id,
    project: toProjectId,
    notesTab: toTabId,
  };
}

function writeItem(projectId, databaseId, item, columns) {
  const project = findProject(projectId);
  const db = findDatabase(project, databaseId);
  if (!project || !db) throw new Error("database not found");
  if (!db.items) db.items = [];
  const cols = columns || DEFAULT_DB_COLS;
  const fieldsIn = item.fields || {};
  const title = fieldsIn.n || fieldsIn.title || item.id || "item";
  const id = item.id || newId();
  let existing = db.items.find((it) => it.id === id);
  if (!existing) {
    existing = { id, fields: {}, body: "" };
    db.items.push(existing);
  }
  const fields = {};
  cols.forEach((c) => { fields[c.id] = fieldsIn[c.id] != null ? fieldsIn[c.id] : ""; });
  Object.keys(fieldsIn).forEach((k) => { if (fields[k] === undefined) fields[k] = fieldsIn[k]; });
  existing.fields = fields;
  existing.body = item.body || "";
  return id;
}

function deleteItem(projectId, databaseId, itemId) {
  const project = findProject(projectId);
  const db = findDatabase(project, databaseId);
  if (!project || !db || !Array.isArray(db.items)) return false;
  const idx = db.items.findIndex((it) => it && it.id === itemId);
  if (idx < 0) return false;
  db.items.splice(idx, 1);
  return true;
}

function readTimelogs() {
  const entries = (store.timelogs || []).map((t) => ({
    id: t.id,
    project: t.project || "",
    board: t.board || "",
    card: t.card || "",
    title: t.title || t.card || "Untitled",
    projectName: t.projectName || t.project || "",
    boardName: t.boardName || t.board || "",
    color: t.color || "#3c3c40",
    kind: t.kind || "pomodoro",
    note: typeof t.note === "string" ? t.note : "",
    startedAt: t.startedAt || "",
    endedAt: t.endedAt || "",
    durationSec: Math.max(0, parseInt(t.durationSec, 10) || 0),
  }));
  entries.sort((a, b) => String(b.endedAt || b.startedAt).localeCompare(String(a.endedAt || a.startedAt)));
  return entries;
}

function writeTimelog(entry) {
  if (!store.timelogs) store.timelogs = [];
  const startedAt = entry.startedAt || new Date().toISOString();
  const endedAt = entry.endedAt || new Date().toISOString();
  const durationSec = Math.max(0, parseInt(entry.durationSec, 10) || 0);
  const id = uniqueTimelogId();
  const data = {
    id,
    project: entry.project || "",
    board: entry.board || "",
    card: entry.card || "",
    title: entry.title || entry.card || "Untitled",
    projectName: entry.projectName || entry.project || "",
    boardName: entry.boardName || entry.board || "",
    color: entry.color || "#3c3c40",
    kind: entry.kind || "pomodoro",
    note: typeof entry.note === "string" ? entry.note : "",
    startedAt,
    endedAt,
    durationSec,
  };
  store.timelogs.push(data);
  return { ...data };
}

function updateTimelog(id, patch) {
  if (!store.timelogs) store.timelogs = [];
  const idx = store.timelogs.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const cur = store.timelogs[idx];
  if (!patch || typeof patch !== "object") return { ...cur };
  const strFields = [
    "note",
    "project",
    "board",
    "card",
    "title",
    "projectName",
    "boardName",
    "color",
    "kind",
    "startedAt",
    "endedAt",
  ];
  strFields.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      cur[k] = typeof patch[k] === "string" ? patch[k] : "";
    }
  });
  if (Object.prototype.hasOwnProperty.call(patch, "durationSec")) {
    cur.durationSec = Math.max(0, parseInt(patch.durationSec, 10) || 0);
  }
  store.timelogs[idx] = cur;
  return { ...cur };
}

function deleteTimelog(id) {
  if (!store.timelogs) store.timelogs = [];
  const before = store.timelogs.length;
  store.timelogs = store.timelogs.filter((t) => t.id !== id);
  return store.timelogs.length < before;
}

function exportZipFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `project-binder-backup-${y}-${m}-${d}.zip`;
}

function writeWorkspaceZip(destZip) {
  if (!store) throw new Error("store not initialized");
  if (!archiveStore) archiveStore = emptyArchiveDoc();
  const zip = new AdmZip();
  const wsBody = JSON.stringify(store, null, 2) + "\n";
  zip.addFile("userWorkspace.json", Buffer.from(wsBody, "utf8"));
  const archBody = JSON.stringify(archiveStore, null, 2) + "\n";
  zip.addFile("userArchive.json", Buffer.from(archBody, "utf8"));
  userData.appendUploadsToZip(zip);
  const tmp = destZip + ".tmp";
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  zip.writeZip(tmp);
  fs.renameSync(tmp, destZip);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/workspace") {
      return json(res, 200, readWorkspace());
    }
    if (req.method === "GET" && url.pathname === "/api/archived-projects") {
      return json(res, 200, readArchivedProjectsMeta());
    }
    if (req.method === "GET" && url.pathname === "/api/export") {
      const filename = exportZipFilename();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-export-"));
      const tmpZip = path.join(tmpDir, filename);
      try {
        writeWorkspaceZip(tmpZip);
        const body = fs.readFileSync(tmpZip);
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": body.length,
          "Cache-Control": "no-store",
        });
        res.end(body);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/workspace/reset-seed") {
      resetToSeedWorkspace();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "POST" && url.pathname === "/api/workspace/reset-empty") {
      resetToEmptyWorkspace();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "POST" && url.pathname === "/api/project") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return json(res, 400, { error: "missing fields" });
      const id = createProject({
        name,
        color: body.color,
        cover: body.cover,
      });
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/project") {
      const body = await readBody(req);
      if (!body.project) return json(res, 400, { error: "missing fields" });
      const active = findProject(body.project);
      const archived = findArchivedProject(body.project);
      if (!active && !archived) {
        return json(res, 404, { error: "project not found" });
      }
      if (body.archived === true) {
        if (archived) return json(res, 200, readWorkspace());
        if (!moveProjectToArchive(body.project)) {
          return json(res, 404, { error: "project not found" });
        }
        saveStore();
        return json(res, 200, readWorkspace());
      }
      if (body.archived === false) {
        if (active) {
          delete active.archived;
          saveStore();
          return json(res, 200, readWorkspace());
        }
        if (!moveProjectFromArchive(body.project)) {
          return json(res, 404, { error: "project not found" });
        }
        saveStore();
        return json(res, 200, readWorkspace());
      }
      if (archived) return json(res, 403, { error: "project is archived" });
      writeProject(body.project, {
        name: body.name,
        color: body.color,
        cover: body.cover,
      });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "DELETE" && url.pathname === "/api/project") {
      const body = await readBody(req);
      if (!body.project) return json(res, 400, { error: "missing fields" });
      if (!softDeleteProject(body.project)) return json(res, 404, { error: "project not found" });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/project-order") {
      const body = await readBody(req);
      if (!Array.isArray(body.order)) return json(res, 400, { error: "missing fields" });
      const result = writeProjectOrder(body.order);
      if (!result.ok) return json(res, 400, { error: result.error });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/card") {
      const body = await readBody(req);
      if (!body.project || !body.board || !body.title) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const id = writeCard(body.project, body.board, body);
      saveStore();
      return json(res, 200, { id, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/card-order") {
      const body = await readBody(req);
      if (!Array.isArray(body.items)) return json(res, 400, { error: "missing fields" });
      writeCardOrder(body.items);
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "DELETE" && url.pathname === "/api/card") {
      const body = await readBody(req);
      if (!body.project || !body.board || !body.id) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      deleteCard(body.project, body.board, body.id, {
        permanent: !!body.permanent,
        keepFiles: !!body.keepFiles,
      });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "GET" && url.pathname === "/api/trash") {
      return json(res, 200, { trash: readTrash() });
    }
    if (req.method === "POST" && url.pathname === "/api/trash/restore") {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: "missing fields" });
      const result = restoreTrashItem(body.id, { restoreParent: !!body.restoreParent });
      if (result.needsParent) {
        return json(res, 409, {
          needsParent: true,
          parentKind: result.parentKind,
          parentName: result.parentName,
          parentTrashId: result.parentTrashId,
          error: "parent container is in trash",
        });
      }
      if (!result.ok) {
        const status = result.error === "not found" ? 404 : result.error === "project is archived" ? 403 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, {
        id: result.id,
        project: result.project,
        board: result.board || null,
        notesTab: result.notesTab || null,
        ...readWorkspace(),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/card") {
      const body = await readBody(req);
      if (!body.project || !body.board || !body.title) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const project = findProject(body.project);
      const board = findBoard(project, body.board);
      if (!board) return json(res, 404, { error: "board not found" });
      let id =
        body.id && isSafePathId(String(body.id))
          ? String(body.id)
          : uniqueCardId();
      if ((board.cards || []).some((c) => c.id === id)) {
        id = uniqueCardId();
      }
      writeCard(body.project, body.board, { ...body, id });
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/board") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      const id = createBoard(body.project, body.name);
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/board") {
      const body = await readBody(req);
      if (!body.project || !body.board || !body.columns) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const board = findBoard(findProject(body.project), body.board);
      if (!board) return json(res, 404, { error: "board not found" });
      writeBoard(body.project, body.board, {
        name: body.name || board.name || body.board,
        columns: body.columns,
      });
      if (body.rename && body.rename.from && body.rename.to) {
        renameBoardStatuses(body.project, body.board, body.rename.from, body.rename.to);
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/masterboard") {
      const body = await readBody(req);
      if (!body.columns) return json(res, 400, { error: "missing fields" });
      writeWorkspaceMeta({ stages: body.columns });
      if (body.rename && body.rename.from && body.rename.to) {
        renameAcrossBoards(body.rename.from, body.rename.to);
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "POST" && url.pathname === "/api/database") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      const id = createDatabase(body.project, body.name);
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/notes-tab") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      const id = createNotesTab(body.project, body.name);
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/files-tab") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const id = createFilesTab(body.project, body.name);
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/file/move") {
      const body = await readBody(req);
      if (
        !body.project ||
        !body.filesTab ||
        !body.file ||
        !body.toProject ||
        !body.toFilesTab
      ) {
        return json(res, 400, { error: "missing fields" });
      }
      const result = moveUploadedFile(
        body.project,
        body.filesTab,
        body.file,
        body.toProject,
        body.toFilesTab
      );
      if (!result.ok) {
        const status =
          result.error === "file not found" || result.error === "destination not found"
            ? 404
            : result.error === "project is archived"
              ? 403
              : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, {
        id: result.id,
        project: result.project,
        filesTab: result.filesTab,
        ...readWorkspace(),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/card-file/move") {
      const body = await readBody(req);
      if (!body.fromProject || !body.toProject || !body.fromBoard || !body.toBoard) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.fromProject) || projectIsArchived(body.toProject)) {
        return json(res, 403, { error: "project is archived" });
      }
      const result = moveCardFileBlobs(
        body.fromProject,
        body.fromBoard,
        body.toProject,
        body.toBoard,
        body.files
      );
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/card-file") {
      const project = url.searchParams.get("project") || "";
      const board = url.searchParams.get("board") || "";
      const card = url.searchParams.get("card") || "";
      const file = url.searchParams.get("file") || "";
      const result = readCardFileBytes(project, board, card, file);
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      const safeName = String(result.name).replace(/[\r\n"]/g, "_");
      res.writeHead(200, {
        "Content-Type": result.mime,
        "Content-Length": result.body.length,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "no-store",
      });
      res.end(result.body);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/card-file") {
      const body = await readBody(req);
      if (!body.project || !body.board || !body.card || !body.name || body.data == null) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = addCardFile(body.project, body.board, body.card, {
        name: body.name,
        mime: body.mime,
        data: body.data,
      });
      if (!result.ok) {
        const status =
          result.error === "board not found"
            ? 404
            : result.error === "file too large"
              ? 413
              : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 201, {
        id: result.file.id,
        file: result.file,
        files: result.files,
        ...readWorkspace(),
      });
    }
    if (req.method === "DELETE" && url.pathname === "/api/card-file") {
      const body = await readBody(req);
      if (!body.project || !body.board || !body.card) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      if (body.all) {
        const result = discardCardFiles(body.project, body.board, body.card);
        if (!result.ok) {
          const status = result.error === "card exists" ? 409 : 400;
          return json(res, status, { error: result.error });
        }
        saveStore();
        return json(res, 200, { files: [], ...readWorkspace() });
      }
      if (!body.file) return json(res, 400, { error: "missing fields" });
      const result = deleteCardFile(body.project, body.board, body.card, body.file);
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, { files: result.files, ...readWorkspace() });
    }
    if (req.method === "GET" && url.pathname === "/api/rte-image") {
      const scope = url.searchParams.get("scope") || "";
      const project = url.searchParams.get("project") || "";
      const file = url.searchParams.get("file") || "";
      let result;
      if (scope === "cover") {
        result = readCoverRteImage(project, file);
      } else if (scope === "note") {
        result = readNoteRteImage(
          project,
          url.searchParams.get("notesTab") || "",
          url.searchParams.get("note") || "",
          file
        );
      } else if (scope === "card") {
        result = readCardRteImage(
          project,
          url.searchParams.get("board") || "",
          url.searchParams.get("card") || "",
          file
        );
      } else {
        return json(res, 400, { error: "invalid scope" });
      }
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      const safeName = String(result.name).replace(/[\r\n"]/g, "_");
      res.writeHead(200, {
        "Content-Type": result.mime,
        "Content-Length": result.body.length,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "no-store",
      });
      res.end(result.body);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/rte-image") {
      const body = await readBody(req);
      if (!body.project || !body.scope || !body.name || body.data == null) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      let result;
      if (body.scope === "cover") {
        result = addCoverRteImage(body.project, {
          name: body.name,
          mime: body.mime,
          data: body.data,
        });
      } else if (body.scope === "note") {
        if (!body.notesTab || !body.note) {
          return json(res, 400, { error: "missing fields" });
        }
        result = addNoteRteImage(body.project, body.notesTab, body.note, {
          name: body.name,
          mime: body.mime,
          data: body.data,
        });
      } else if (body.scope === "card") {
        if (!body.board || !body.card) {
          return json(res, 400, { error: "missing fields" });
        }
        result = addCardRteImage(body.project, body.board, body.card, {
          name: body.name,
          mime: body.mime,
          data: body.data,
        });
      } else {
        return json(res, 400, { error: "invalid scope" });
      }
      if (!result.ok) {
        const status =
          result.error === "note not found" ||
          result.error === "project not found" ||
          result.error === "board not found"
            ? 404
            : result.error === "file too large"
              ? 413
              : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 201, {
        id: result.file.id,
        file: result.file,
        images: result.images,
        ...readWorkspace(),
      });
    }
    if (req.method === "DELETE" && url.pathname === "/api/rte-image") {
      const body = await readBody(req);
      if (!body.project || !body.scope || !body.file) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      let result;
      if (body.scope === "cover") {
        result = deleteCoverRteImage(body.project, body.file);
      } else if (body.scope === "note") {
        if (!body.notesTab || !body.note) {
          return json(res, 400, { error: "missing fields" });
        }
        result = deleteNoteRteImage(body.project, body.notesTab, body.note, body.file);
      } else if (body.scope === "card") {
        if (!body.board || !body.card) {
          return json(res, 400, { error: "missing fields" });
        }
        result = deleteCardRteImage(body.project, body.board, body.card, body.file);
      } else {
        return json(res, 400, { error: "invalid scope" });
      }
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, { images: result.images, ...readWorkspace() });
    }
    if (req.method === "GET" && url.pathname === "/api/file") {
      const project = url.searchParams.get("project") || "";
      const filesTab = url.searchParams.get("filesTab") || "";
      const file = url.searchParams.get("file") || "";
      const result = readUploadedFile(project, filesTab, file);
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      const safeName = String(result.name).replace(/[\r\n"]/g, "_");
      res.writeHead(200, {
        "Content-Type": result.mime,
        "Content-Length": result.body.length,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "no-store",
      });
      res.end(result.body);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/file") {
      const body = await readBody(req);
      if (!body.project || !body.filesTab || !body.name || body.data == null) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = addUploadedFile(body.project, body.filesTab, {
        name: body.name,
        mime: body.mime,
        data: body.data,
      });
      if (!result.ok) {
        const status =
          result.error === "files tab not found"
            ? 404
            : result.error === "file too large"
              ? 413
              : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 201, { id: result.id, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/file") {
      const body = await readBody(req);
      if (!body.project || !body.filesTab || !body.file || body.name == null) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = renameUploadedFile(body.project, body.filesTab, body.file, body.name);
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "DELETE" && url.pathname === "/api/file") {
      const body = await readBody(req);
      if (!body.project || !body.filesTab || !body.file) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = deleteUploadedFile(body.project, body.filesTab, body.file);
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/tab") {
      const body = await readBody(req);
      if (!body.project || !body.type || !body.id || body.name == null) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = renameTab(body.project, body.type, body.id, body.name);
      if (!result.ok) {
        const status = result.error === "project not found" || result.error === "tab not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "DELETE" && url.pathname === "/api/tab") {
      const body = await readBody(req);
      if (!body.project || !body.type || !body.id) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = deleteTab(body.project, body.type, body.id);
      if (!result.ok) {
        const status = result.error === "project not found" || result.error === "tab not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/tab-order") {
      const body = await readBody(req);
      if (!body.project || !Array.isArray(body.order)) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = writeTabOrder(body.project, body.order);
      if (!result.ok) {
        const status = result.error === "project not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "POST" && url.pathname === "/api/note") {
      const body = await readBody(req);
      if (!body.project || !body.notesTab) return json(res, 400, { error: "missing fields" });
      const tab = findNotesTab(findProject(body.project), body.notesTab);
      if (!tab) return json(res, 404, { error: "notes tab not found" });
      const title = String(body.title || "").trim() || "Untitled";
      const id = uniqueNoteId();
      const noteBody =
        body.body != null ? String(body.body) : "<h1></h1>";
      writeNote(body.project, body.notesTab, { id, title, body: noteBody });
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/note") {
      const body = await readBody(req);
      if (!body.project || !body.notesTab || !body.note) {
        return json(res, 400, { error: "missing fields" });
      }
      const tab = findNotesTab(findProject(body.project), body.notesTab);
      if (!tab || !(tab.notes || []).some((n) => n.id === body.note)) {
        return json(res, 404, { error: "note not found" });
      }
      writeNote(body.project, body.notesTab, {
        id: body.note,
        title: body.title,
        body: body.body,
        pinned: body.pinned,
      });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "POST" && url.pathname === "/api/note/move") {
      const body = await readBody(req);
      if (
        !body.project ||
        !body.notesTab ||
        !body.note ||
        !body.toProject ||
        !body.toNotesTab
      ) {
        return json(res, 400, { error: "missing fields" });
      }
      const result = moveNote(
        body.project,
        body.notesTab,
        body.note,
        body.toProject,
        body.toNotesTab
      );
      if (!result.ok) {
        const status =
          result.error === "note not found" || result.error === "destination not found"
            ? 404
            : result.error === "project is archived"
              ? 403
              : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, {
        id: result.id,
        project: result.project,
        notesTab: result.notesTab,
        ...readWorkspace(),
      });
    }
    if (req.method === "DELETE" && url.pathname === "/api/note") {
      const body = await readBody(req);
      if (!body.project || !body.notesTab || !body.note) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = deleteNote(body.project, body.notesTab, body.note);
      if (!result.ok) {
        const status = result.error === "note not found" || result.error === "notes tab not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/database") {
      const body = await readBody(req);
      if (!body.project || !body.database) return json(res, 400, { error: "missing fields" });
      if (body.columns == null && body.customViews == null && body.customViewId == null) {
        return json(res, 400, { error: "missing fields" });
      }
      const db = findDatabase(findProject(body.project), body.database);
      if (!db && !findProject(body.project)) return json(res, 404, { error: "project not found" });
      writeDatabase(body.project, body.database, {
        name: body.name || (db && db.name) || body.database,
        columns: body.columns !== undefined ? body.columns : db && db.columns,
        customViews: body.customViews,
        customViewId: body.customViewId,
      });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "PUT" && url.pathname === "/api/item") {
      const body = await readBody(req);
      if (!body.project || !body.database || !body.fields) return json(res, 400, { error: "missing fields" });
      const cols = loadDbColumns(body.project, body.database);
      const id = writeItem(body.project, body.database, body, cols);
      saveStore();
      return json(res, 200, { id, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/item") {
      const body = await readBody(req);
      if (!body.project || !body.database) return json(res, 400, { error: "missing fields" });
      const project = findProject(body.project);
      const db = findDatabase(project, body.database);
      if (!db) return json(res, 404, { error: "database not found" });
      const cols = loadDbColumns(body.project, body.database);
      const fields = body.fields || {};
      cols.forEach((c) => {
        if (fields[c.id] == null) fields[c.id] = c.type === "stage" ? "Applied" : "";
      });
      const id = uniqueItemId();
      writeItem(body.project, body.database, { id, fields, body: body.body || "" }, cols);
      saveStore();
      return json(res, 201, { id, ...readWorkspace() });
    }
    if (req.method === "DELETE" && url.pathname === "/api/item") {
      const body = await readBody(req);
      if (!body.project || !body.database || !body.id) {
        return json(res, 400, { error: "missing fields" });
      }
      if (!deleteItem(body.project, body.database, body.id)) {
        return json(res, 404, { error: "item not found" });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "GET" && url.pathname === "/api/timelogs") {
      return json(res, 200, { timelogs: readTimelogs() });
    }
    if (req.method === "POST" && url.pathname === "/api/timelog") {
      const body = await readBody(req);
      if (!body.project || !body.card || !body.startedAt || !body.endedAt) {
        return json(res, 400, { error: "missing fields" });
      }
      const entry = writeTimelog(body);
      saveStore();
      return json(res, 201, { entry, timelogs: readTimelogs() });
    }
    if (req.method === "PUT" && url.pathname === "/api/timelog") {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: "missing fields" });
      const { id, ...patch } = body;
      const entry = updateTimelog(id, patch);
      if (!entry) return json(res, 404, { error: "timelog not found" });
      saveStore();
      return json(res, 200, { entry, timelogs: readTimelogs() });
    }
    if (req.method === "DELETE" && url.pathname === "/api/timelog") {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: "missing fields" });
      if (!deleteTimelog(body.id)) return json(res, 404, { error: "timelog not found" });
      saveStore();
      return json(res, 200, { timelogs: readTimelogs() });
    }
    if (req.method === "GET") {
      const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
      if (reqPath.includes("..")) return json(res, 400, { error: "bad path" });
      const filePath = path.join(DIST, reqPath);
      if (filePath.startsWith(DIST) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const body = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        return res.end(body);
      }
      // SPA fallback for non-API routes when dist is built
      const indexHtml = path.join(DIST, "index.html");
      if (fs.existsSync(indexHtml) && !reqPath.startsWith("/api")) {
        const body = fs.readFileSync(indexHtml);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(body);
      }
      if (!fs.existsSync(DIST)) {
        return json(res, 503, {
          error: "Frontend not built. Run npm run build, then restart npm start.",
        });
      }
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

const boot = ensureStore();
server.listen(PORT, () => {
  console.log(`Project Binder v0.1.0 at http://localhost:${PORT}`);
  if (userData.persistent) {
    console.log(`User data: ${USER_DATA_DIR}`);
    console.log(`User workspace: ${USER_WORKSPACE}`);
  } else {
    console.log(`User data: in-memory (seed on boot; not writing OS Application Support)`);
  }
  console.log(`Seed workspace (read-only): ${SEED_WORKSPACE}`);
  if (boot.reseeded) console.log(`Seeded workspace from seedWorkspace.json (${boot.reason})`);
  if (boot.purged) console.log(`Purged ${boot.purged} trash item(s) older than 30 days`);
});
