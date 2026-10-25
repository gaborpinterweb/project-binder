/**
 * Browser port of server.cjs workspace logic: in-memory, API-shaped handlers, no HTTP/fs.
 * Metadata lives in the workspace JSON; file bytes live in fileBlobStore (uploads not wired yet).
 */
import { normalizeImpact, normalizeEffort } from "../cardMeta.js";
import { NAME_COL_ID, nameColumn } from "../dbFields.js";
import { normalizeColWidths, normalizeHiddenCols } from "../dbViews.js";
import { fileBlobStore, blobKey } from "./fileBlobStore.js";

const DEFAULT_STAGES = ["Backlog", "This week", "Today", "Tomorrow", "Next week"];
const DEFAULT_BOARD_COLS = ["Idea", "Mandatory"];
const DEFAULT_DB_COLS = [
  { id: NAME_COL_ID, label: "Name", type: "text" },
  { id: "r", label: "Role", type: "text" },
  { id: "s", label: "Stage", type: "stage" },
];
const DEFAULT_CUSTOM_VIEW_ID = "default";
const DEFAULT_CUSTOM_VIEW_NAME = "Default view";
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
/** Seed file treats this local calendar day as "today"; shifted on every seed load. */
const SEED_ANCHOR_YMD = "2026-09-30";
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same fixed id as client COVER_TAB_ID: cover RTE images live under this tab folder. */
const COVER_TAB_ID = "00000000-0000-4000-8000-0000000000c0";
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const emptyArchiveDoc = () => ({ version: 2, projects: [] });
const emptyWorkspaceDoc = () => ({
  version: 2,
  stages: DEFAULT_STAGES.slice(),
  projects: [],
  timelogs: [],
  trash: [],
});

let store = emptyWorkspaceDoc();
/** Archived projects live here, never inside `store.projects`. */
let archiveStore = emptyArchiveDoc();
let lastSeedDoc = null;
let onChange = null;

/** Draft card attachments / RTE images before the card row exists. key = project\0board\0card */
const pendingCardFiles = new Map();
const pendingCardImages = new Map();

const newId = () => crypto.randomUUID();
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
const isDemoValue = (v) => v === true || String(v || "").toLowerCase() === "true";
const isArchivedValue = isDemoValue;

function isValidStore(doc) {
  return (
    !!doc &&
    typeof doc === "object" &&
    Number(doc.version) >= 2 &&
    Array.isArray(doc.stages) &&
    Array.isArray(doc.projects) &&
    Array.isArray(doc.timelogs)
  );
}

function isValidArchive(doc) {
  return !!doc && typeof doc === "object" && Number(doc.version) >= 2 && Array.isArray(doc.projects);
}

function unlinkUpload(projectId, tabId, fileId) {
  fileBlobStore.delete(blobKey(projectId, tabId, fileId));
}

/** Metadata always moves; bytes follow only when present (uploads are not wired yet). */
function moveUpload(fromProject, fromTab, fromFile, toProject, toTab, toFile) {
  const from = blobKey(fromProject, fromTab, fromFile);
  const blob = fileBlobStore.get(from);
  if (blob !== undefined) {
    fileBlobStore.delete(from);
    fileBlobStore.set(blobKey(toProject, toTab, toFile), blob);
  }
  return { ok: true };
}

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

function ensureTrash() {
  if (!store.trash) store.trash = [];
  if (!Array.isArray(store.trash)) store.trash = [];
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

function isSafePathId(s) {
  return typeof s === "string" && UUID_RE.test(s);
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
  const id = newId();
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
    id: newId(),
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

function purgeCardFileBlobs(projectId, boardId, files) {
  if (!isSafePathId(projectId) || !isSafePathId(boardId)) return;
  for (const f of normalizeCardFiles(files)) {
    unlinkUpload(projectId, boardId, f.id);
  }
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
  unlinkUpload(projectId, boardId, fileId);
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

/** Move card attachment blobs between tab folders (board UUID = folder). */
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
    const moved = moveUpload(
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
    unlinkUpload(projectId, tabId, f.id);
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
    const moved = moveUpload(
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
  unlinkUpload(projectId, notesTabId, fileId);
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
  unlinkUpload(projectId, COVER_TAB_ID, fileId);
  return { ok: true, images };
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
  unlinkUpload(projectId, boardId, fileId);
  return { ok: true, images };
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function decodeBase64(data) {
  try {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function writeUpload(projectId, tabId, fileId, bytes) {
  fileBlobStore.set(blobKey(projectId, tabId, fileId), bytes);
}

function isAllowedRteImageMime(mime, name) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"].includes(ext);
}

function addCardFile(projectId, boardId, cardId, { name, mime, data }) {
  if (!isSafePathId(projectId) || !isSafePathId(boardId) || !isSafePathId(cardId)) {
    return { ok: false, error: "invalid path" };
  }
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board) return { ok: false, error: "board not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  const buf = decodeBase64(data);
  if (!buf) return { ok: false, error: "invalid data" };
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const files = listCardFiles(projectId, boardId, cardId);
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  writeUpload(projectId, boardId, id, buf);
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
  const buf = decodeBase64(data);
  if (!buf) return { ok: false, error: "invalid data" };
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  if (!tab.files) tab.files = [];
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  writeUpload(projectId, filesTabId, id, buf);
  tab.files.push({
    id,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, id };
}

function addNoteRteImage(projectId, notesTabId, noteId, { name, mime, data }) {
  if (!isSafePathId(projectId) || !isSafePathId(notesTabId) || !isSafePathId(noteId)) {
    return { ok: false, error: "invalid path" };
  }
  const note = findNoteRecord(projectId, notesTabId, noteId);
  if (!note) return { ok: false, error: "note not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (!isAllowedRteImageMime(mime, fileName)) return { ok: false, error: "not an image" };
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  const buf = decodeBase64(data);
  if (!buf) return { ok: false, error: "invalid data" };
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  writeUpload(projectId, notesTabId, id, buf);
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
  if (!isAllowedRteImageMime(mime, fileName)) return { ok: false, error: "not an image" };
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  const buf = decodeBase64(data);
  if (!buf) return { ok: false, error: "invalid data" };
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  writeUpload(projectId, COVER_TAB_ID, id, buf);
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

function addCardRteImage(projectId, boardId, cardId, { name, mime, data }) {
  if (!isSafePathId(projectId) || !isSafePathId(boardId) || !isSafePathId(cardId)) {
    return { ok: false, error: "invalid path" };
  }
  const project = findProject(projectId);
  const board = findBoard(project, boardId);
  if (!project || !board) return { ok: false, error: "board not found" };
  const fileName = String(name || "").trim();
  if (!fileName) return { ok: false, error: "missing fields" };
  if (!isAllowedRteImageMime(mime, fileName)) return { ok: false, error: "not an image" };
  if (typeof data !== "string" || !data) return { ok: false, error: "missing fields" };
  const buf = decodeBase64(data);
  if (!buf) return { ok: false, error: "invalid data" };
  if (!buf.length) return { ok: false, error: "empty file" };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file too large" };
  const id = newId();
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  writeUpload(projectId, boardId, id, buf);
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
    id: newId(),
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
    id: newId(),
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
    id: newId(),
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
    id: newId(),
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
    id: newId(),
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
    id: newId(),
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
    id = newId();
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
      unlinkUpload(item.project, item.filesTab, item.file);
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

function createNotesTab(projectId, name) {
  const project = findProject(projectId);
  if (!project) throw new Error("project not found");
  if (!project.notesTabs) project.notesTabs = [];
  const tabId = newId();
  project.notesTabs.push({ id: tabId, name, notes: [] });
  appendTabOrder(project, "notes", tabId);
  return tabId;
}

function createFilesTab(projectId, name) {
  const project = findProject(projectId);
  if (!project) throw new Error("project not found");
  if (!project.filesTabs) project.filesTabs = [];
  const tabId = newId();
  project.filesTabs.push({ id: tabId, name, files: [] });
  appendTabOrder(project, "files", tabId);
  return tabId;
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
  if (!toTab.files) toTab.files = [];
  let id = fileId;
  if (toTab.files.some((f) => f.id === id)) {
    id = newId();
  }
  if (!isSafePathId(id)) return { ok: false, error: "invalid name" };
  const moved = moveUpload(
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
    id = newId();
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
  const id = newId();
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

function removeTrash(item) {
  ensureTrash();
  const i = store.trash.findIndex((t) => t.id === item.id);
  if (i >= 0) store.trash.splice(i, 1);
}

/** `found` if live; otherwise fail with needsParent, or restore the trashed parent when allowed. */
function resolveParent({ found, kind, parent, restoreParent, restore, name, pick }) {
  if (found) return { found };
  if (!parent) return {};
  if (!restoreParent) {
    return {
      fail: {
        ok: false,
        needsParent: true,
        parentKind: kind,
        parentName: name(parent),
        parentTrashId: parent.id,
      },
    };
  }
  const restored = restore(parent);
  return restored.ok ? { found: pick(restored) } : { fail: restored };
}

function projectForRestore(item, restoreParent) {
  const r = resolveParent({
    found: findProject(item.project),
    kind: "project",
    parent: findTrashParent("project", item.project),
    restoreParent,
    restore: restoreProjectFromTrash,
    name: (p) => p.projectName || p.title || item.project,
    pick: (x) => findProject(x.project),
  });
  if (r.fail) return r;
  if (!r.found) return { fail: { ok: false, error: "project not found" } };
  if (projectIsArchived(r.found.id)) return { fail: { ok: false, error: "project is archived" } };
  return r;
}

const CONTAINERS = {
  board: {
    find: findBoard,
    nameKey: "boardName",
    restore: restoreBoardFromTrash,
    missing: "original board not found",
  },
  notesTab: {
    find: findNotesTab,
    nameKey: "notesTabName",
    restore: restoreNotesTabFromTrash,
    missing: "original notes tab not found",
  },
  filesTab: {
    find: findFilesTab,
    nameKey: "filesTabName",
    restore: restoreFilesTabFromTrash,
    missing: "original files tab not found",
  },
};

/** Container (board / notesTab / filesTab) for a trashed child; kind doubles as the item/result key. */
function containerForRestore(project, item, restoreParent, kind) {
  const c = CONTAINERS[kind];
  const id = item[kind];
  const r = resolveParent({
    found: c.find(project, id),
    kind,
    parent: findTrashParent(kind, item.project, id),
    restoreParent,
    restore: c.restore,
    name: (p) => p[c.nameKey] || p.title || id,
    pick: (x) => c.find(project, x[kind]),
  });
  if (r.fail) return r;
  return r.found ? r : { fail: { ok: false, error: c.missing } };
}

function restoreBoardFromTrash(item, { restoreParent = false } = {}) {
  const p = projectForRestore(item, restoreParent);
  if (p.fail) return p.fail;
  const project = p.found;
  if (!project.boards) project.boards = [];
  const id = item.board || newId();
  // Already restored: leave the trash entry alone.
  if (findBoard(project, id)) return { ok: true, project: project.id, board: id, id };
  const board = {
    id,
    name: item.boardName || item.title || id,
    columns:
      Array.isArray(item.columns) && item.columns.length
        ? item.columns.slice()
        : DEFAULT_BOARD_COLS.slice(),
    cards: [],
  };
  if (isDemoValue(item.isDemo)) board.isDemo = true;
  project.boards.push(board);
  appendTabOrder(project, "board", id);
  removeTrash(item);
  return { ok: true, project: project.id, board: id, id };
}

function restoreNotesTabFromTrash(item, { restoreParent = false } = {}) {
  const p = projectForRestore(item, restoreParent);
  if (p.fail) return p.fail;
  const project = p.found;
  if (!project.notesTabs) project.notesTabs = [];
  const id = item.notesTab || newId();
  if (findNotesTab(project, id)) return { ok: true, project: project.id, notesTab: id, id };
  project.notesTabs.push({ id, name: item.notesTabName || item.title || id, notes: [] });
  appendTabOrder(project, "notes", id);
  removeTrash(item);
  return { ok: true, project: project.id, notesTab: id, id };
}

function restoreFilesTabFromTrash(item, { restoreParent = false } = {}) {
  const p = projectForRestore(item, restoreParent);
  if (p.fail) return p.fail;
  const project = p.found;
  if (!project.filesTabs) project.filesTabs = [];
  const id = item.filesTab || newId();
  if (findFilesTab(project, id)) return { ok: true, project: project.id, filesTab: id, id };
  project.filesTabs.push({ id, name: item.filesTabName || item.title || id, files: [] });
  appendTabOrder(project, "files", id);
  removeTrash(item);
  return { ok: true, project: project.id, filesTab: id, id };
}

function restoreCardFromTrash(item, { restoreParent = false } = {}) {
  const p = projectForRestore(item, restoreParent);
  if (p.fail) return p.fail;
  const project = p.found;
  const b = containerForRestore(project, item, restoreParent, "board");
  if (b.fail) return b.fail;
  const board = b.found;
  removeTrash(item);
  if (!board.cards) board.cards = [];
  let id = item.card || newId();
  if (board.cards.some((c) => c.id === id)) id = newId();
  const cols = Array.isArray(board.columns) && board.columns.length ? board.columns : DEFAULT_BOARD_COLS;
  const stages = Array.isArray(store.stages) && store.stages.length ? store.stages : DEFAULT_STAGES;
  const card = {
    id,
    title: item.title || id,
    status: cols.includes(item.status) ? item.status : cols[0],
    master: stages.includes(item.master) ? item.master : stages[0],
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
  const p = projectForRestore(item, restoreParent);
  if (p.fail) return p.fail;
  const project = p.found;
  const t = containerForRestore(project, item, restoreParent, "notesTab");
  if (t.fail) return t.fail;
  const tab = t.found;
  removeTrash(item);
  if (!tab.notes) tab.notes = [];
  let id = item.note || newId();
  if (tab.notes.some((n) => n.id === id)) id = newId();
  const now = new Date().toISOString();
  const note = {
    id,
    title: item.title || id,
    body: item.body || "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  };
  if (item.pinned) note.pinned = true;
  const images = normalizeCardFiles(item.images);
  if (images.length) note.images = images;
  tab.notes.push(note);
  return { ok: true, project: project.id, notesTab: tab.id || item.notesTab, id };
}

function restoreFileFromTrash(item, { restoreParent = false } = {}) {
  const p = projectForRestore(item, restoreParent);
  if (p.fail) return p.fail;
  const project = p.found;
  const t = containerForRestore(project, item, restoreParent, "filesTab");
  if (t.fail) return t.fail;
  const tab = t.found;
  const tabId = tab.id || item.filesTab;
  const fileId = item.file || "";
  if (!isSafePathId(project.id) || !isSafePathId(tabId) || !isSafePathId(fileId)) {
    return { ok: false, error: "invalid path" };
  }
  removeTrash(item);
  if (!tab.files) tab.files = [];
  let id = fileId;
  if (tab.files.some((f) => f.id === id)) id = newId();
  if (id !== fileId) moveUpload(project.id, tabId, fileId, project.id, tabId, id);
  tab.files.push({
    id,
    name: item.name || item.title || id,
    mime: item.mime || "application/octet-stream",
    size: Number(item.size) || 0,
    createdAt: item.createdAt || new Date().toISOString(),
  });
  return { ok: true, project: project.id, filesTab: tabId, id };
}

/* ---------- Handlers: server.cjs route bodies as { status, data } ---------- */

const R = (status, data) => ({ status, data });
const err = (status, error) => R(status, { error });
const wsRes = (status, extra) => R(status, { ...extra, ...readWorkspace() });
const missing = () => err(400, "missing fields");
const archived = () => err(403, "project is archived");

const core = {
  postProject(b) {
    const name = String(b.name || "").trim();
    if (!name) return missing();
    const id = createProject({ name, color: b.color, cover: b.cover });
    return wsRes(201, { id });
  },
  putProject(b) {
    if (!b.project) return missing();
    const active = findProject(b.project);
    const arch = findArchivedProject(b.project);
    if (!active && !arch) return err(404, "project not found");
    if (b.archived === true) {
      if (arch) return wsRes(200);
      if (!moveProjectToArchive(b.project)) return err(404, "project not found");
      return wsRes(200);
    }
    if (b.archived === false) {
      if (active) {
        delete active.archived;
        return wsRes(200);
      }
      if (!moveProjectFromArchive(b.project)) return err(404, "project not found");
      return wsRes(200);
    }
    if (arch) return archived();
    writeProject(b.project, { name: b.name, color: b.color, cover: b.cover });
    return wsRes(200);
  },
  deleteProjectApi(b) {
    if (!b.project) return missing();
    if (!softDeleteProject(b.project)) return err(404, "project not found");
    return wsRes(200);
  },
  putProjectOrder(b) {
    if (!Array.isArray(b.order)) return missing();
    const r = writeProjectOrder(b.order);
    return r.ok ? wsRes(200) : err(400, r.error);
  },
  putCard(b) {
    if (!b.project || !b.board || !b.title) return missing();
    if (projectIsArchived(b.project)) return archived();
    return wsRes(200, { id: writeCard(b.project, b.board, b) });
  },
  postCard(b) {
    if (!b.project || !b.board || !b.title) return missing();
    if (projectIsArchived(b.project)) return archived();
    const board = findBoard(findProject(b.project), b.board);
    if (!board) return err(404, "board not found");
    let id = b.id && isSafePathId(String(b.id)) ? String(b.id) : newId();
    if ((board.cards || []).some((c) => c.id === id)) id = newId();
    writeCard(b.project, b.board, { ...b, id });
    return wsRes(201, { id });
  },
  putCardOrder(b) {
    if (!Array.isArray(b.items)) return missing();
    writeCardOrder(b.items);
    return wsRes(200);
  },
  deleteCardApi(b) {
    if (!b.project || !b.board || !b.id) return missing();
    if (projectIsArchived(b.project)) return archived();
    deleteCard(b.project, b.board, b.id, { permanent: !!b.permanent, keepFiles: !!b.keepFiles });
    return wsRes(200);
  },
  restoreTrashApi(b) {
    if (!b.id) return missing();
    const r = restoreTrashItem(b.id, { restoreParent: !!b.restoreParent });
    if (r.needsParent) {
      return R(409, {
        needsParent: true,
        parentKind: r.parentKind,
        parentName: r.parentName,
        parentTrashId: r.parentTrashId,
        error: "parent container is in trash",
      });
    }
    if (!r.ok) {
      return err(r.error === "not found" ? 404 : r.error === "project is archived" ? 403 : 400, r.error);
    }
    return wsRes(200, {
      id: r.id,
      project: r.project,
      board: r.board || null,
      notesTab: r.notesTab || null,
    });
  },
  postBoard(b) {
    if (!b.project || !b.name) return missing();
    if (projectIsArchived(b.project)) return archived();
    if (!findProject(b.project)) return err(404, "project not found");
    return wsRes(201, { id: createBoard(b.project, b.name) });
  },
  putBoard(b) {
    if (!b.project || !b.board || !b.columns) return missing();
    if (projectIsArchived(b.project)) return archived();
    const board = findBoard(findProject(b.project), b.board);
    if (!board) return err(404, "board not found");
    writeBoard(b.project, b.board, {
      name: b.name || board.name || b.board,
      columns: b.columns,
    });
    if (b.rename && b.rename.from && b.rename.to) {
      renameBoardStatuses(b.project, b.board, b.rename.from, b.rename.to);
    }
    return wsRes(200);
  },
  putMasterboard(b) {
    if (!b.columns) return missing();
    writeWorkspaceMeta({ stages: b.columns });
    if (b.rename && b.rename.from && b.rename.to) renameAcrossBoards(b.rename.from, b.rename.to);
    return wsRes(200);
  },
  postDatabase(b) {
    if (!b.project || !b.name) return missing();
    if (!findProject(b.project)) return err(404, "project not found");
    return wsRes(201, { id: createDatabase(b.project, b.name) });
  },
  putDatabase(b) {
    if (!b.project || !b.database) return missing();
    if (b.columns == null && b.customViews == null && b.customViewId == null) return missing();
    const project = findProject(b.project);
    const db = findDatabase(project, b.database);
    if (!db && !project) return err(404, "project not found");
    writeDatabase(b.project, b.database, {
      name: b.name || (db && db.name) || b.database,
      columns: b.columns !== undefined ? b.columns : db && db.columns,
      customViews: b.customViews,
      customViewId: b.customViewId,
    });
    return wsRes(200);
  },
  putItem(b) {
    if (!b.project || !b.database || !b.fields) return missing();
    const cols = loadDbColumns(b.project, b.database);
    return wsRes(200, { id: writeItem(b.project, b.database, b, cols) });
  },
  postItem(b) {
    if (!b.project || !b.database) return missing();
    if (!findDatabase(findProject(b.project), b.database)) return err(404, "database not found");
    const cols = loadDbColumns(b.project, b.database);
    const fields = b.fields || {};
    cols.forEach((c) => {
      if (fields[c.id] == null) fields[c.id] = c.type === "stage" ? "Applied" : "";
    });
    const id = newId();
    writeItem(b.project, b.database, { id, fields, body: b.body || "" }, cols);
    return wsRes(201, { id });
  },
  deleteItemApi(b) {
    if (!b.project || !b.database || !b.id) return missing();
    if (!deleteItem(b.project, b.database, b.id)) return err(404, "item not found");
    return wsRes(200);
  },
  postNotesTab(b) {
    if (!b.project || !b.name) return missing();
    if (!findProject(b.project)) return err(404, "project not found");
    return wsRes(201, { id: createNotesTab(b.project, b.name) });
  },
  postFilesTab(b) {
    if (!b.project || !b.name) return missing();
    if (!findProject(b.project)) return err(404, "project not found");
    if (projectIsArchived(b.project)) return archived();
    return wsRes(201, { id: createFilesTab(b.project, b.name) });
  },
  postNote(b) {
    if (!b.project || !b.notesTab) return missing();
    if (!findNotesTab(findProject(b.project), b.notesTab)) return err(404, "notes tab not found");
    const id = newId();
    writeNote(b.project, b.notesTab, {
      id,
      title: String(b.title || "").trim() || "Untitled",
      body: b.body != null ? String(b.body) : "<h1></h1>",
    });
    return wsRes(201, { id });
  },
  putNote(b) {
    if (!b.project || !b.notesTab || !b.note) return missing();
    const tab = findNotesTab(findProject(b.project), b.notesTab);
    if (!tab || !(tab.notes || []).some((n) => n.id === b.note)) return err(404, "note not found");
    writeNote(b.project, b.notesTab, { id: b.note, title: b.title, body: b.body, pinned: b.pinned });
    return wsRes(200);
  },
  deleteNoteApi(b) {
    if (!b.project || !b.notesTab || !b.note) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = deleteNote(b.project, b.notesTab, b.note);
    return r.ok ? wsRes(200) : err(404, r.error);
  },
  moveNoteApi(b) {
    if (!b.project || !b.notesTab || !b.note || !b.toProject || !b.toNotesTab) return missing();
    const r = moveNote(b.project, b.notesTab, b.note, b.toProject, b.toNotesTab);
    if (!r.ok) return err(moveErrorStatus(r.error), r.error);
    return wsRes(200, { id: r.id, project: r.project, notesTab: r.notesTab });
  },
  putTab(b) {
    if (!b.project || !b.type || !b.id || b.name == null) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = renameTab(b.project, b.type, b.id, b.name);
    return r.ok ? wsRes(200) : err(tabErrorStatus(r.error), r.error);
  },
  deleteTabApi(b) {
    if (!b.project || !b.type || !b.id) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = deleteTab(b.project, b.type, b.id);
    return r.ok ? wsRes(200) : err(tabErrorStatus(r.error), r.error);
  },
  putTabOrder(b) {
    if (!b.project || !Array.isArray(b.order)) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = writeTabOrder(b.project, b.order);
    return r.ok ? wsRes(200) : err(r.error === "project not found" ? 404 : 400, r.error);
  },
  postFile(b) {
    if (!b.project || !b.filesTab || !b.name || b.data == null) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = addUploadedFile(b.project, b.filesTab, {
      name: b.name,
      mime: b.mime,
      data: b.data,
    });
    if (!r.ok) {
      return err(
        r.error === "files tab not found" ? 404 : r.error === "file too large" ? 413 : 400,
        r.error
      );
    }
    return wsRes(201, { id: r.id });
  },
  postCardFile(b) {
    if (!b.project || !b.board || !b.card || !b.name || b.data == null) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = addCardFile(b.project, b.board, b.card, {
      name: b.name,
      mime: b.mime,
      data: b.data,
    });
    if (!r.ok) {
      return err(
        r.error === "board not found" ? 404 : r.error === "file too large" ? 413 : 400,
        r.error
      );
    }
    return wsRes(201, { id: r.file.id, file: r.file, files: r.files });
  },
  postRteImage(b) {
    if (!b.project || !b.scope || !b.name || b.data == null) return missing();
    if (projectIsArchived(b.project)) return archived();
    let r;
    if (b.scope === "cover") {
      r = addCoverRteImage(b.project, { name: b.name, mime: b.mime, data: b.data });
    } else if (b.scope === "note") {
      if (!b.notesTab || !b.note) return missing();
      r = addNoteRteImage(b.project, b.notesTab, b.note, {
        name: b.name,
        mime: b.mime,
        data: b.data,
      });
    } else if (b.scope === "card") {
      if (!b.board || !b.card) return missing();
      r = addCardRteImage(b.project, b.board, b.card, {
        name: b.name,
        mime: b.mime,
        data: b.data,
      });
    } else {
      return err(400, "invalid scope");
    }
    if (!r.ok) {
      return err(
        r.error === "note not found" ||
          r.error === "project not found" ||
          r.error === "board not found"
          ? 404
          : r.error === "file too large"
            ? 413
            : 400,
        r.error
      );
    }
    return wsRes(201, { id: r.file.id, file: r.file, images: r.images });
  },
  putFile(b) {
    if (!b.project || !b.filesTab || !b.file || b.name == null) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = renameUploadedFile(b.project, b.filesTab, b.file, b.name);
    return r.ok ? wsRes(200) : err(r.error === "file not found" ? 404 : 400, r.error);
  },
  deleteFileApi(b) {
    if (!b.project || !b.filesTab || !b.file) return missing();
    if (projectIsArchived(b.project)) return archived();
    const r = softDeleteUploadedFile(b.project, b.filesTab, b.file);
    return r.ok ? wsRes(200) : err(r.error === "file not found" ? 404 : 400, r.error);
  },
  moveFileApi(b) {
    if (!b.project || !b.filesTab || !b.file || !b.toProject || !b.toFilesTab) return missing();
    const r = moveUploadedFile(b.project, b.filesTab, b.file, b.toProject, b.toFilesTab);
    if (!r.ok) return err(moveErrorStatus(r.error), r.error);
    return wsRes(200, { id: r.id, project: r.project, filesTab: r.filesTab });
  },
  deleteCardFileApi(b) {
    if (!b.project || !b.board || !b.card) return missing();
    if (projectIsArchived(b.project)) return archived();
    if (b.all) {
      const r = discardCardFiles(b.project, b.board, b.card);
      if (!r.ok) return err(r.error === "card exists" ? 409 : 400, r.error);
      return wsRes(200, { files: [] });
    }
    if (!b.file) return missing();
    const r = deleteCardFile(b.project, b.board, b.card, b.file);
    if (!r.ok) return err(r.error === "file not found" ? 404 : 400, r.error);
    return wsRes(200, { files: r.files });
  },
  moveCardFilesApi(b) {
    if (!b.fromProject || !b.toProject || !b.fromBoard || !b.toBoard) return missing();
    if (projectIsArchived(b.fromProject) || projectIsArchived(b.toProject)) return archived();
    const r = moveCardFileBlobs(b.fromProject, b.fromBoard, b.toProject, b.toBoard, b.files);
    return r.ok ? R(200, { ok: true }) : err(r.error === "file not found" ? 404 : 400, r.error);
  },
  deleteRteImageApi(b) {
    if (!b.project || !b.scope || !b.file) return missing();
    if (projectIsArchived(b.project)) return archived();
    let r;
    if (b.scope === "cover") {
      r = deleteCoverRteImage(b.project, b.file);
    } else if (b.scope === "note") {
      if (!b.notesTab || !b.note) return missing();
      r = deleteNoteRteImage(b.project, b.notesTab, b.note, b.file);
    } else if (b.scope === "card") {
      if (!b.board || !b.card) return missing();
      r = deleteCardRteImage(b.project, b.board, b.card, b.file);
    } else {
      return err(400, "invalid scope");
    }
    if (!r.ok) return err(r.error === "file not found" ? 404 : 400, r.error);
    return wsRes(200, { images: r.images });
  },
  postTimelog(b) {
    if (!b.project || !b.card || !b.startedAt || !b.endedAt) return missing();
    const entry = writeTimelog(b);
    return R(201, { entry, timelogs: readTimelogs() });
  },
  putTimelog(b) {
    if (!b.id) return missing();
    const { id, ...patch } = b;
    const entry = updateTimelog(id, patch);
    if (!entry) return err(404, "timelog not found");
    return R(200, { entry, timelogs: readTimelogs() });
  },
  deleteTimelogApi(b) {
    if (!b.id) return missing();
    if (!deleteTimelog(b.id)) return err(404, "timelog not found");
    return R(200, { timelogs: readTimelogs() });
  },
};

function moveErrorStatus(error) {
  if (error === "project is archived") return 403;
  return error === "note not found" || error === "file not found" || error === "destination not found"
    ? 404
    : 400;
}

function tabErrorStatus(error) {
  return error === "project not found" || error === "tab not found" ? 404 : 400;
}

/** Same JSON boundary as HTTP: bodies in, plain copies out. */
function run(fn, body) {
  try {
    const r = fn(body ? deepClone(body) : {});
    if (r.status < 400) onChange?.();
    return r;
  } catch (e) {
    return err(500, String(e.message || e));
  }
}

/** api.js `apiData`: always resolves with the body (including `{ error }`). */
const asData = (fn) => async (body) => deepClone(run(fn, body).data);

/** api.js `apiOkData`: rejects with the server error text. */
const asOkData = (fn, fallbackMsg) => async (body) => {
  const r = run(fn, body);
  if (r.status >= 300) throw new Error(r.data?.error || fallbackMsg);
  return deepClone(r.data);
};

/* ---------- Loading / lifecycle ---------- */

function loadFromWorkspaceDoc(doc) {
  if (!isValidStore(doc)) throw new Error("invalid workspace doc");
  store = deepClone(doc);
  ensureTrash();
  const migrated = migrateArchivedOutOfWorkspace();
  const purged = purgeExpiredTrash();
  return { migrated, purged };
}

function loadFromArchiveDoc(doc) {
  if (!isValidArchive(doc)) throw new Error("invalid archive doc");
  archiveStore = deepClone(doc);
  archiveStore.version = Math.max(2, Number(archiveStore.version) || 2);
}

function seedEmpty() {
  store = emptyWorkspaceDoc();
  archiveStore = emptyArchiveDoc();
  fileBlobStore.clear();
}

/** Remembers `seedDoc` so resetWorkspaceToSeed() can be called without arguments later. */
function resetToSeed(seedDoc = lastSeedDoc) {
  if (!seedDoc) throw new Error("seed doc not provided");
  lastSeedDoc = seedDoc;
  archiveStore = emptyArchiveDoc();
  store = prepareSeedWorkspace(deepClone(seedDoc));
  ensureTrash();
  migrateArchivedOutOfWorkspace();
  fileBlobStore.clear();
  return deepClone(readWorkspace());
}

function exportWorkspaceData() {
  return { workspace: deepClone(store), archive: deepClone(archiveStore) };
}

export const workspaceEngine = {
  loadFromWorkspaceDoc,
  loadFromArchiveDoc,
  seedEmpty,
  resetToSeed,
  exportWorkspaceData,
  /** Called after every successful mutation (persistence hook). */
  setOnChange(fn) {
    onChange = typeof fn === "function" ? fn : null;
  },
  getWorkspace: () => deepClone(readWorkspace()),
  getArchivedProjects: () => readArchivedProjectsMeta().projects,
  setFileBlob: (project, tab, file, blob) => fileBlobStore.set(blobKey(project, tab, file), blob),
  getFileBlob: (project, tab, file) => fileBlobStore.get(blobKey(project, tab, file)),

  fetchWorkspace: async () => deepClone(readWorkspace()),
  fetchArchivedProjects: async () => readArchivedProjectsMeta().projects,
  fetchTrash: async () => deepClone(readTrash()),
  fetchTimelogs: async () => readTimelogs(),

  putCard: asData(core.putCard),
  postCard: asData(core.postCard),
  putCardOrder: asData(core.putCardOrder),
  deleteCardApi: asData(core.deleteCardApi),
  restoreTrashApi: async (body) => {
    const r = run(core.restoreTrashApi, body);
    if (r.data.needsParent) return deepClone(r.data);
    if (r.status >= 300) throw new Error(r.data.error || "restore failed");
    return deepClone(r.data);
  },

  putProject: asData(core.putProject),
  postProject: async (body) => {
    const r = run(core.postProject, body);
    return { ok: r.status < 300, data: deepClone(r.data) };
  },
  deleteProjectApi: asData(core.deleteProjectApi),
  putProjectOrder: asData(core.putProjectOrder),

  putBoard: asData(core.putBoard),
  postBoard: asData(core.postBoard),
  putMasterboard: asData(core.putMasterboard),

  postTimelog: asData(core.postTimelog),
  putTimelog: asOkData(core.putTimelog, "Could not update timelog"),
  deleteTimelogApi: asOkData(core.deleteTimelogApi, "Could not delete timelog"),

  putItem: asData(core.putItem),
  postItem: asData(core.postItem),
  deleteItemApi: asData(core.deleteItemApi),
  /** Matches api.js: resolves with nothing. */
  putDatabase: async (body) => {
    run(core.putDatabase, body);
  },
  postDatabase: asData(core.postDatabase),

  postNotesTab: asData(core.postNotesTab),
  postFilesTab: asData(core.postFilesTab),
  postNote: asData(core.postNote),
  putNote: asData(core.putNote),
  deleteNoteApi: asData(core.deleteNoteApi),
  moveNoteApi: asOkData(core.moveNoteApi, "Could not move note"),

  putTab: asData(core.putTab),
  deleteTabApi: asData(core.deleteTabApi),
  putTabOrder: asData(core.putTabOrder),

  postFile: asOkData(core.postFile, "Could not upload file"),
  postCardFile: asOkData(core.postCardFile, "Could not upload file"),
  postRteImage: asOkData(core.postRteImage, "Could not upload image"),
  putFile: asOkData(core.putFile, "Could not rename file"),
  deleteFileApi: asData(core.deleteFileApi),
  moveFileApi: asOkData(core.moveFileApi, "Could not move file"),
  deleteCardFileApi: asOkData(core.deleteCardFileApi, "Could not delete file"),
  moveCardFilesApi: asOkData(core.moveCardFilesApi, "Could not move files"),
  deleteRteImageApi: asOkData(core.deleteRteImageApi, "Could not delete image"),

  resetWorkspaceToSeed: async (seedDoc) => {
    const ws = resetToSeed(seedDoc);
    onChange?.();
    return ws;
  },
  resetWorkspaceToEmpty: async () => {
    seedEmpty();
    onChange?.();
    return deepClone(readWorkspace());
  },
};

export { COVER_TAB_ID };
