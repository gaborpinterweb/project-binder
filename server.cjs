#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const {
  createUserDataStore,
  isPackagedElectron,
  isValidStore,
} = require("./userDataStore.cjs");

const APP_USER_DATA_NAME = "Project Binder";
const SEED_WORKSPACE = path.join(__dirname, "seedWorkspace.json");
const SEED_UPLOADS = path.join(__dirname, "seedUploads");
const userData = createUserDataStore({
  appName: APP_USER_DATA_NAME,
  seedUploadsDir: SEED_UPLOADS,
});
const USER_DATA_DIR = userData.dir;
const USER_WORKSPACE = userData.workspacePath;
const AUTO_BACKUP_PREFIX = "project-binder-backup-";
const AUTO_BACKUP_SUFFIX = ".zip";
const AUTO_BACKUP_FILENAME_PATTERN = "project-binder-backup-YYYY-MM-DD.zip";
const AUTO_BACKUP_KEEP_DAYS = 3;
const AUTO_BACKUP_DAY_RE = /^project-binder-backup-(\d{4}-\d{2}-\d{2})\.zip$/i;
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
// Packaged desktop keeps 3456; CLI / unpackaged use 3457 so both can run at once.
const DEFAULT_PORT_PACKAGED = 3456;
const DEFAULT_PORT_CLI = 3457;
function resolvePort() {
  const raw = process.env.PROJECT_BINDER_PORT || process.env.PORT;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return isPackagedElectron() ? DEFAULT_PORT_PACKAGED : DEFAULT_PORT_CLI;
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
const DEFAULT_BOARD_COLS = ["Design", "Frontend dev", "Backend dev", "Content"];
const DEFAULT_DB_COLS = [
  { id: "n", label: "Name", type: "text" },
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
    if (!s || seen.has(s)) continue;
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

function createDefaultCustomView(filters, hiddenCols, sorts) {
  return {
    id: DEFAULT_CUSTOM_VIEW_ID,
    name: DEFAULT_CUSTOM_VIEW_NAME,
    filters: normalizeFilters(filters),
    hiddenCols: normalizeHiddenCols(hiddenCols),
    sorts: normalizeSorts(sorts),
  };
}

function normalizeCustomViews(views) {
  const extras = [];
  let defaultFilters = emptyFilterState();
  let defaultHiddenCols = [];
  let defaultSorts = emptySortState();
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.id == null) continue;
    const id = String(v.id);
    if (id === DEFAULT_CUSTOM_VIEW_ID) {
      defaultFilters = normalizeFilters(v.filters);
      defaultHiddenCols = normalizeHiddenCols(v.hiddenCols);
      defaultSorts = normalizeSorts(v.sorts);
      continue;
    }
    extras.push({
      id,
      name: String(v.name || "Untitled view").trim() || "Untitled view",
      filters: normalizeFilters(v.filters),
      hiddenCols: normalizeHiddenCols(v.hiddenCols),
      sorts: normalizeSorts(v.sorts),
    });
  }
  return [createDefaultCustomView(defaultFilters, defaultHiddenCols, defaultSorts), ...extras];
}

function resolveCustomViewId(viewId, views) {
  const list = normalizeCustomViews(views);
  if (viewId && list.some((v) => v.id === viewId)) return String(viewId);
  return DEFAULT_CUSTOM_VIEW_ID;
}

const DB_FIELD_TYPES = new Set([
  "text",
  "longtext",
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

function normalizeDbColumn(c) {
  if (!c || !c.id) return null;
  const type = DB_FIELD_TYPES.has(c.type) ? c.type : "text";
  const out = { id: String(c.id), label: c.label || String(c.id), type };
  if (c.required) out.required = true;
  if (type === "number" && c.decimal) out.decimal = true;
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
  const mapped = columns.map(normalizeDbColumn).filter(Boolean);
  return mapped.length ? mapped : DEFAULT_DB_COLS.map((c) => ({ ...c }));
}

/** @type {object|null} */
let store = null;

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
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
  return deepClone(result.doc);
}

function saveStore() {
  if (!store) throw new Error("store not initialized");
  userData.writeWorkspaceFile(store);
}

function ensureStore() {
  if (userData.persistent) {
    const user = userData.readWorkspaceFile();
    if (user.ok) {
      store = deepClone(user.doc);
      ensureTrash();
      const purged = purgeExpiredTrash();
      if (purged) saveStore();
      return { reseeded: false, purged };
    }
    store = loadSeedWorkspace();
    ensureTrash();
    installSeedUploads();
    saveStore();
    return { reseeded: true, reason: user.reason, purged: 0 };
  }
  store = loadSeedWorkspace();
  ensureTrash();
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
  store = loadSeedWorkspace();
  ensureTrash();
  installSeedUploads();
  saveStore();
}

function emptyWorkspaceDoc() {
  return {
    version: 1,
    stages: DEFAULT_STAGES.slice(),
    projects: [],
    timelogs: [],
    trash: [],
  };
}

function resetToEmptyWorkspace() {
  store = emptyWorkspaceDoc();
  clearUploads();
  saveStore();
}

function findProject(slug) {
  return (store.projects || []).find((p) => p.slug === slug) || null;
}

function findBoard(project, boardSlug) {
  if (!project) return null;
  return (project.boards || []).find((b) => b.slug === boardSlug) || null;
}

function findDatabase(project, dbSlug) {
  if (!project) return null;
  return (project.databases || []).find((d) => d.slug === dbSlug) || null;
}

function findNotesTab(project, tabSlug) {
  if (!project) return null;
  return (project.notesTabs || []).find((t) => t.slug === tabSlug) || null;
}

function findFilesTab(project, tabSlug) {
  if (!project) return null;
  return (project.filesTabs || []).find((t) => t.slug === tabSlug) || null;
}

function isSafePathSlug(s) {
  return typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

function removeUploadTree(projectSlug, tabSlug) {
  if (!isSafePathSlug(projectSlug) || !isSafePathSlug(tabSlug)) return;
  userData.removeUploadTree(projectSlug, tabSlug);
}

function tabKey(type, slug) {
  return `${type}:${slug}`;
}

function defaultTabOrderEntries(project) {
  return [
    ...(project.boards || []).map((b) => ({ type: "board", slug: b.slug })),
    ...(project.notesTabs || []).map((t) => ({ type: "notes", slug: t.slug })),
    ...(project.filesTabs || []).map((t) => ({ type: "files", slug: t.slug })),
    ...(project.databases || []).map((d) => ({ type: "database", slug: d.slug })),
  ];
}

function normalizeTabOrder(project) {
  const valid = new Map();
  for (const e of defaultTabOrderEntries(project)) {
    valid.set(tabKey(e.type, e.slug), e);
  }
  const next = [];
  const seen = new Set();
  for (const raw of project.tabOrder || []) {
    if (!raw || !raw.type || !raw.slug) continue;
    const type = String(raw.type);
    const slug = String(raw.slug);
    const key = tabKey(type, slug);
    if (!valid.has(key) || seen.has(key)) continue;
    next.push({ type, slug });
    seen.add(key);
  }
  for (const e of defaultTabOrderEntries(project)) {
    const key = tabKey(e.type, e.slug);
    if (seen.has(key)) continue;
    next.push(e);
    seen.add(key);
  }
  project.tabOrder = next;
  return next;
}

function appendTabOrder(project, type, slug) {
  normalizeTabOrder(project);
  const key = tabKey(type, slug);
  if (project.tabOrder.some((e) => tabKey(e.type, e.slug) === key)) return;
  project.tabOrder.push({ type, slug });
}

function removeTabOrder(project, type, slug) {
  if (!project.tabOrder) return;
  const key = tabKey(type, slug);
  project.tabOrder = project.tabOrder.filter((e) => tabKey(e.type, e.slug) !== key);
}

function renameTab(projectSlug, type, slug, name) {
  const project = findProject(projectSlug);
  if (!project) return { ok: false, error: "project not found" };
  const title = String(name || "").trim();
  if (!title) return { ok: false, error: "missing fields" };
  if (type === "board") {
    const board = findBoard(project, slug);
    if (!board) return { ok: false, error: "tab not found" };
    board.name = title;
    return { ok: true };
  }
  if (type === "notes") {
    const tab = findNotesTab(project, slug);
    if (!tab) return { ok: false, error: "tab not found" };
    tab.name = title;
    return { ok: true };
  }
  if (type === "database") {
    const db = findDatabase(project, slug);
    if (!db) return { ok: false, error: "tab not found" };
    db.name = title;
    return { ok: true };
  }
  if (type === "files") {
    const tab = findFilesTab(project, slug);
    if (!tab) return { ok: false, error: "tab not found" };
    tab.name = title;
    return { ok: true };
  }
  return { ok: false, error: "invalid type" };
}

function deleteTab(projectSlug, type, slug) {
  if (type === "board") return softDeleteBoard(projectSlug, slug);
  if (type === "notes") return softDeleteNotesTab(projectSlug, slug);
  // databases / files stay hard-delete for now
  const project = findProject(projectSlug);
  if (!project) return { ok: false, error: "project not found" };
  if (type === "database") {
    const idx = (project.databases || []).findIndex((d) => d.slug === slug);
    if (idx < 0) return { ok: false, error: "tab not found" };
    project.databases.splice(idx, 1);
    removeTabOrder(project, type, slug);
    return { ok: true };
  }
  if (type === "files") {
    const idx = (project.filesTabs || []).findIndex((t) => t.slug === slug);
    if (idx < 0) return { ok: false, error: "tab not found" };
    project.filesTabs.splice(idx, 1);
    removeTabOrder(project, type, slug);
    removeUploadTree(projectSlug, slug);
    return { ok: true };
  }
  return { ok: false, error: "invalid type" };
}

function writeTabOrder(projectSlug, order) {
  const project = findProject(projectSlug);
  if (!project) return { ok: false, error: "project not found" };
  if (!Array.isArray(order)) return { ok: false, error: "missing fields" };
  const valid = new Map();
  for (const e of defaultTabOrderEntries(project)) {
    valid.set(tabKey(e.type, e.slug), e);
  }
  const next = [];
  const seen = new Set();
  for (const raw of order) {
    if (!raw || !raw.type || !raw.slug) continue;
    const type = String(raw.type);
    const slug = String(raw.slug);
    const key = tabKey(type, slug);
    if (!valid.has(key) || seen.has(key)) continue;
    next.push({ type, slug });
    seen.add(key);
  }
  for (const e of defaultTabOrderEntries(project)) {
    const key = tabKey(e.type, e.slug);
    if (seen.has(key)) continue;
    next.push(e);
    seen.add(key);
  }
  project.tabOrder = next;
  return { ok: true };
}

function writeProjectOrder(order) {
  if (!Array.isArray(order)) return { ok: false, error: "missing fields" };
  const bySlug = new Map((store.projects || []).map((p) => [p.slug, p]));
  const next = [];
  const seen = new Set();
  for (const raw of order) {
    const slug = String(raw || "");
    if (!slug || !bySlug.has(slug) || seen.has(slug)) continue;
    next.push(bySlug.get(slug));
    seen.add(slug);
  }
  for (const p of store.projects || []) {
    if (seen.has(p.slug)) continue;
    next.push(p);
  }
  store.projects = next;
  return { ok: true };
}

function projectIsArchived(slug) {
  const p = findProject(slug);
  return p ? isArchivedValue(p.archived) : false;
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
    slug: p.slug,
    name: p.name || p.slug,
    color: p.color || "#9a5b2e",
    cover: { values: { description: p.description || "" } },
    boards: (p.boards || []).map((b) => {
      const board = {
        slug: b.slug,
        name: b.name || b.slug,
        columns: Array.isArray(b.columns) && b.columns.length ? b.columns.slice() : DEFAULT_BOARD_COLS.slice(),
        cards: (b.cards || []).map((c) => {
          const card = {
            slug: c.slug,
            title: c.title || c.slug,
            status: c.status || (b.columns && b.columns[0]) || "Design",
            master: c.master || "Backlog",
            doneAt: c.doneAt || "",
            body: c.body || "",
          };
          if (c.ord != null && c.ord !== "" && !Number.isNaN(Number(c.ord))) {
            card.ord = Number(c.ord);
          }
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
        slug: d.slug,
        name: d.name || d.slug,
        columns: normalizeDbColumns(d.columns),
        customViews,
        customViewId: resolveCustomViewId(d.customViewId, customViews),
        items: (d.items || []).map((item) => ({
          slug: item.slug,
          fields: { ...(item.fields || {}) },
          body: item.body || "",
        })),
      };
    }),
    notesTabs: (p.notesTabs || []).map((t) => ({
      slug: t.slug,
      name: t.name || t.slug,
      notes: (t.notes || []).map((n) => ({
        slug: n.slug,
        title: n.title || n.slug,
        body: n.body || "",
        createdAt: n.createdAt || n.updatedAt || "",
        updatedAt: n.updatedAt || "",
      })),
    })),
    filesTabs: (p.filesTabs || []).map((t) => ({
      slug: t.slug,
      name: t.name || t.slug,
      files: (t.files || []).map((f) => ({
        slug: f.slug,
        name: f.name || f.slug,
        mime: f.mime || "application/octet-stream",
        size: Number(f.size) || 0,
        createdAt: f.createdAt || "",
      })),
    })),
    tabOrder: normalizeTabOrder(p).map((e) => ({ type: e.type, slug: e.slug })),
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

function uniqueProjectSlug(name) {
  const base = slugify(name) || "project";
  let slug = base;
  let i = 2;
  while (findProject(slug)) slug = base + "-" + i++;
  return slug;
}

function uniqueCardSlug(board, title) {
  const base = slugify(title) || "card";
  let slug = base;
  let i = 2;
  const cards = board.cards || [];
  while (cards.some((c) => c.slug === slug)) slug = base + "-" + i++;
  return slug;
}

function uniqueItemSlug(database, title) {
  const base = slugify(title) || "item";
  let slug = base;
  let i = 2;
  const items = database.items || [];
  while (items.some((it) => it.slug === slug)) slug = base + "-" + i++;
  return slug;
}

function uniqueTimelogSlug(base) {
  let slug = base;
  let i = 2;
  while ((store.timelogs || []).some((t) => t.slug === slug)) slug = base + "-" + i++;
  return slug;
}

function writeProject(projectSlug, patch) {
  const p = findProject(projectSlug);
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
  if (patch.archived != null) {
    if (isArchivedValue(patch.archived)) p.archived = true;
    else delete p.archived;
  }
  return true;
}

function createProject({ name, color, cover }) {
  const title = String(name || "").trim() || "Untitled";
  const slug = uniqueProjectSlug(title);
  const description =
    cover && cover.values && cover.values.description != null
      ? String(cover.values.description)
      : "";
  const project = {
    slug,
    name: title,
    color: color || "#9a5b2e",
    description,
    boards: [],
    databases: [],
    notesTabs: [],
    filesTabs: [],
  };
  store.projects.push(project);
  return slug;
}

function softDeleteProject(projectSlug) {
  if (!projectSlug || projectSlug.includes("..") || projectSlug.includes("/") || projectSlug.includes("\\")) {
    return false;
  }
  const idx = store.projects.findIndex((p) => p.slug === projectSlug);
  if (idx < 0) return false;
  const [project] = store.projects.splice(idx, 1);
  ensureTrash();
  const entry = {
    kind: "project",
    slug: uniqueTrashSlug(project.slug || project.name || "project"),
    deletedAt: new Date().toISOString(),
    project: project.slug,
    projectName: project.name || project.slug,
    color: project.color || "#9a5b2e",
    title: project.name || project.slug,
    snapshot: deepClone(project),
  };
  if (isDemoValue(project.isDemo)) entry.isDemo = true;
  store.trash.push(entry);
  return true;
}

function writeCard(projectSlug, boardSlug, card) {
  const project = findProject(projectSlug);
  const board = findBoard(project, boardSlug);
  if (!project || !board) throw new Error("board not found");
  if (!board.cards) board.cards = [];
  const slug = card.slug || slugify(card.title);
  let existing = board.cards.find((c) => c.slug === slug);
  const isNew = !existing;
  if (!existing) {
    existing = { slug };
    board.cards.push(existing);
  }
  existing.title = card.title || slug;
  existing.status = card.status || "Design";
  existing.master = card.master || "Backlog";
  existing.body = card.body || "";
  if (card.doneAt) existing.doneAt = card.doneAt;
  else delete existing.doneAt;
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
  const demo = card.isDemo != null ? card.isDemo : existing.isDemo;
  if (isDemoValue(demo)) existing.isDemo = true;
  else delete existing.isDemo;
  return slug;
}

function writeCardOrder(items) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || !item.project || !item.board || !item.slug) continue;
    if (projectIsArchived(item.project)) continue;
    const project = findProject(item.project);
    const board = findBoard(project, item.board);
    if (!project || !board || !board.cards) continue;
    const card = board.cards.find((c) => c.slug === item.slug);
    if (!card) continue;
    if (item.title != null) card.title = item.title || card.title;
    if (item.status != null) card.status = item.status;
    if (item.master != null) card.master = item.master;
    if (item.body != null) card.body = item.body;
    if (item.doneAt != null) {
      if (item.doneAt) card.doneAt = item.doneAt;
      else delete card.doneAt;
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

function uniqueTrashSlug(base) {
  ensureTrash();
  const root = slugify(base) || "card";
  let slug = "trash-" + root;
  let i = 2;
  while (store.trash.some((t) => t.slug === slug)) slug = "trash-" + root + "-" + i++;
  return slug;
}

function softDeleteCard(projectSlug, boardSlug, cardSlug) {
  const project = findProject(projectSlug);
  const board = findBoard(project, boardSlug);
  if (!board || !board.cards) return false;
  const idx = board.cards.findIndex((c) => c.slug === cardSlug);
  if (idx < 0) return false;
  const [card] = board.cards.splice(idx, 1);
  ensureTrash();
  const entry = {
    kind: "card",
    slug: uniqueTrashSlug(card.slug || card.title || "card"),
    deletedAt: new Date().toISOString(),
    project: projectSlug,
    board: boardSlug,
    card: card.slug || "",
    title: card.title || card.slug || "Untitled",
    status: card.status || "",
    master: card.master || "",
    body: card.body || "",
    doneAt: card.doneAt || "",
    projectName: project.name || projectSlug,
    boardName: board.name || boardSlug,
    color: project.color || "#9a5b2e",
  };
  if (isDemoValue(card.isDemo)) entry.isDemo = true;
  store.trash.push(entry);
  return true;
}

function softDeleteNote(projectSlug, notesTabSlug, noteSlug) {
  const project = findProject(projectSlug);
  const tab = findNotesTab(project, notesTabSlug);
  if (!project || !tab || !tab.notes) return false;
  const idx = tab.notes.findIndex((n) => n.slug === noteSlug);
  if (idx < 0) return false;
  const [note] = tab.notes.splice(idx, 1);
  ensureTrash();
  store.trash.push({
    kind: "note",
    slug: uniqueTrashSlug(note.slug || note.title || "note"),
    deletedAt: new Date().toISOString(),
    project: projectSlug,
    notesTab: notesTabSlug,
    note: note.slug || "",
    title: note.title || note.slug || "Untitled",
    body: note.body || "",
    createdAt: note.createdAt || "",
    updatedAt: note.updatedAt || "",
    projectName: project.name || projectSlug,
    notesTabName: tab.name || notesTabSlug,
    color: project.color || "#9a5b2e",
  });
  return true;
}

function softDeleteBoard(projectSlug, boardSlug) {
  const project = findProject(projectSlug);
  if (!project) return { ok: false, error: "project not found" };
  const idx = (project.boards || []).findIndex((b) => b.slug === boardSlug);
  if (idx < 0) return { ok: false, error: "tab not found" };
  const board = project.boards[idx];
  for (const card of [...(board.cards || [])]) {
    softDeleteCard(projectSlug, boardSlug, card.slug);
  }
  ensureTrash();
  store.trash.push({
    kind: "board",
    slug: uniqueTrashSlug(board.slug || board.name || "board"),
    deletedAt: new Date().toISOString(),
    project: projectSlug,
    board: board.slug,
    boardName: board.name || board.slug,
    columns: Array.isArray(board.columns) && board.columns.length
      ? board.columns.slice()
      : DEFAULT_BOARD_COLS.slice(),
    projectName: project.name || projectSlug,
    color: project.color || "#9a5b2e",
    title: board.name || board.slug,
  });
  if (isDemoValue(board.isDemo)) store.trash[store.trash.length - 1].isDemo = true;
  project.boards.splice(idx, 1);
  removeTabOrder(project, "board", boardSlug);
  return { ok: true };
}

function softDeleteNotesTab(projectSlug, notesTabSlug) {
  const project = findProject(projectSlug);
  if (!project) return { ok: false, error: "project not found" };
  const idx = (project.notesTabs || []).findIndex((t) => t.slug === notesTabSlug);
  if (idx < 0) return { ok: false, error: "tab not found" };
  const tab = project.notesTabs[idx];
  for (const note of [...(tab.notes || [])]) {
    softDeleteNote(projectSlug, notesTabSlug, note.slug);
  }
  ensureTrash();
  store.trash.push({
    kind: "notesTab",
    slug: uniqueTrashSlug(tab.slug || tab.name || "notes"),
    deletedAt: new Date().toISOString(),
    project: projectSlug,
    notesTab: tab.slug,
    notesTabName: tab.name || tab.slug,
    projectName: project.name || projectSlug,
    color: project.color || "#9a5b2e",
    title: tab.name || tab.slug,
  });
  project.notesTabs.splice(idx, 1);
  removeTabOrder(project, "notes", notesTabSlug);
  return { ok: true };
}

function hardDeleteCard(projectSlug, boardSlug, cardSlug) {
  const project = findProject(projectSlug);
  const board = findBoard(project, boardSlug);
  if (!board || !board.cards) return;
  const idx = board.cards.findIndex((c) => c.slug === cardSlug);
  if (idx >= 0) board.cards.splice(idx, 1);
}

function deleteCard(projectSlug, boardSlug, cardSlug, { permanent = false } = {}) {
  if (permanent) return hardDeleteCard(projectSlug, boardSlug, cardSlug);
  return softDeleteCard(projectSlug, boardSlug, cardSlug);
}

function findTrashParent(kind, projectSlug, containerSlug) {
  ensureTrash();
  if (kind === "project") {
    return (
      store.trash.find((t) => t.kind === "project" && t.project === projectSlug) || null
    );
  }
  if (kind === "board") {
    return (
      store.trash.find(
        (t) => t.kind === "board" && t.project === projectSlug && t.board === containerSlug
      ) || null
    );
  }
  if (kind === "notesTab") {
    return (
      store.trash.find(
        (t) =>
          t.kind === "notesTab" && t.project === projectSlug && t.notesTab === containerSlug
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
  let slug = project.slug || item.project || slugify(item.projectName || item.title) || "project";
  if (findProject(slug)) {
    slug = uniqueProjectSlug(project.name || item.projectName || item.title || slug);
  }
  project.slug = slug;
  if (!project.name) project.name = item.projectName || item.title || slug;
  if (!store.projects) store.projects = [];
  store.projects.push(project);
  ensureTrash();
  const trashIdx = store.trash.findIndex((t) => t.slug === item.slug);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: slug, slug };
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
        parentTrashSlug: parent.slug,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.slug)) return { ok: false, error: "project is archived" };
  if (!project.boards) project.boards = [];
  let slug = item.board || slugify(item.boardName || item.title) || "board";
  if (findBoard(project, slug)) {
    // already restored
    return { ok: true, project: project.slug, board: slug, slug };
  }
  const cols = Array.isArray(item.columns) && item.columns.length
    ? item.columns.slice()
    : DEFAULT_BOARD_COLS.slice();
  project.boards.push({
    slug,
    name: item.boardName || item.title || slug,
    columns: cols,
    cards: [],
  });
  if (isDemoValue(item.isDemo)) project.boards[project.boards.length - 1].isDemo = true;
  appendTabOrder(project, "board", slug);
  const trashIdx = store.trash.findIndex((t) => t.slug === item.slug);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: project.slug, board: slug, slug };
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
        parentTrashSlug: parent.slug,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.slug)) return { ok: false, error: "project is archived" };
  if (!project.notesTabs) project.notesTabs = [];
  let slug = item.notesTab || slugify(item.notesTabName || item.title) || "notes";
  if (findNotesTab(project, slug)) {
    return { ok: true, project: project.slug, notesTab: slug, slug };
  }
  project.notesTabs.push({
    slug,
    name: item.notesTabName || item.title || slug,
    notes: [],
  });
  appendTabOrder(project, "notes", slug);
  const trashIdx = store.trash.findIndex((t) => t.slug === item.slug);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: project.slug, notesTab: slug, slug };
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
        parentTrashSlug: parent.slug,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.slug)) return { ok: false, error: "project is archived" };
  let board = findBoard(project, item.board);
  if (!board) {
    const parent = findTrashParent("board", item.project, item.board);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "board",
        parentName: parent.boardName || parent.title || item.board,
        parentTrashSlug: parent.slug,
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
  const idx = store.trash.findIndex((t) => t.slug === item.slug);
  if (idx >= 0) store.trash.splice(idx, 1);
  if (!board.cards) board.cards = [];
  let slug = item.card || slugify(item.title) || "card";
  if (board.cards.some((c) => c.slug === slug)) slug = uniqueCardSlug(board, item.title || slug);
  const cols = Array.isArray(board.columns) && board.columns.length ? board.columns : DEFAULT_BOARD_COLS;
  const status = cols.includes(item.status) ? item.status : cols[0];
  const stages = Array.isArray(store.stages) && store.stages.length ? store.stages : DEFAULT_STAGES;
  const master = stages.includes(item.master) ? item.master : stages[0];
  const card = {
    slug,
    title: item.title || slug,
    status,
    master,
    body: item.body || "",
  };
  if (item.doneAt) card.doneAt = item.doneAt;
  if (isDemoValue(item.isDemo)) card.isDemo = true;
  board.cards.push(card);
  return { ok: true, project: project.slug, board: board.slug || item.board, slug };
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
        parentTrashSlug: parent.slug,
      };
    }
    if (parent && restoreParent) {
      const restored = restoreProjectFromTrash(parent);
      if (!restored.ok) return restored;
      project = findProject(restored.project);
    }
  }
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(project.slug)) return { ok: false, error: "project is archived" };
  let tab = findNotesTab(project, item.notesTab);
  if (!tab) {
    const parent = findTrashParent("notesTab", item.project, item.notesTab);
    if (parent && !restoreParent) {
      return {
        ok: false,
        needsParent: true,
        parentKind: "notesTab",
        parentName: parent.notesTabName || parent.title || item.notesTab,
        parentTrashSlug: parent.slug,
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
  const idx = store.trash.findIndex((t) => t.slug === item.slug);
  if (idx >= 0) store.trash.splice(idx, 1);
  if (!tab.notes) tab.notes = [];
  let slug = item.note || slugify(item.title) || "note";
  if (tab.notes.some((n) => n.slug === slug)) slug = uniqueNoteSlug(tab, item.title || slug);
  const now = new Date().toISOString();
  tab.notes.push({
    slug,
    title: item.title || slug,
    body: item.body || "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  });
  return { ok: true, project: project.slug, notesTab: tab.slug || item.notesTab, slug };
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
        slug: t.slug,
        deletedAt: t.deletedAt || "",
        project: t.project || "",
        projectName: t.projectName || t.project || "",
        color: t.color || "#9a5b2e",
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
      return {
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
    });
}

function restoreTrashItem(trashSlug, { restoreParent = false } = {}) {
  ensureTrash();
  const idx = store.trash.findIndex((t) => t.slug === trashSlug);
  if (idx < 0) return { ok: false, error: "not found" };
  const item = store.trash[idx];
  const kind = item.kind || "card";
  if (kind === "project") return restoreProjectFromTrash(item);
  if (kind === "board") return restoreBoardFromTrash(item, { restoreParent });
  if (kind === "notesTab") return restoreNotesTabFromTrash(item, { restoreParent });
  if (kind === "note") return restoreNoteFromTrash(item, { restoreParent });
  return restoreCardFromTrash(item, { restoreParent });
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function purgeExpiredTrash() {
  ensureTrash();
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const before = store.trash.length;
  store.trash = store.trash.filter((item) => {
    const t = Date.parse(item.deletedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
  return before - store.trash.length;
}

function createBoard(projectSlug, name) {
  const project = findProject(projectSlug);
  if (!project) throw new Error("project not found");
  if (!project.boards) project.boards = [];
  const bSlug = slugify(name);
  const existing = findBoard(project, bSlug);
  if (existing) {
    existing.name = name;
    if (!existing.columns || !existing.columns.length) existing.columns = DEFAULT_BOARD_COLS.slice();
    if (!existing.cards) existing.cards = [];
    appendTabOrder(project, "board", bSlug);
    return bSlug;
  }
  project.boards.push({
    slug: bSlug,
    name,
    columns: DEFAULT_BOARD_COLS.slice(),
    cards: [],
  });
  appendTabOrder(project, "board", bSlug);
  return bSlug;
}

function writeBoard(projectSlug, boardSlug, { name, columns, isDemo }) {
  const project = findProject(projectSlug);
  const board = findBoard(project, boardSlug);
  if (!project || !board) throw new Error("board not found");
  const cols = normalizeColumns(columns);
  board.name = name || board.name || boardSlug;
  board.columns = cols.length ? cols : DEFAULT_BOARD_COLS.slice();
  const demo = isDemo != null ? isDemo : board.isDemo;
  if (isDemoValue(demo)) board.isDemo = true;
  else delete board.isDemo;
}

function renameBoardStatuses(projectSlug, boardSlug, from, to) {
  if (!from || !to || from === to) return;
  const board = findBoard(findProject(projectSlug), boardSlug);
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

function loadDbColumns(projectSlug, databaseSlug) {
  const db = findDatabase(findProject(projectSlug), databaseSlug);
  return normalizeDbColumns(db && db.columns);
}

function writeDatabase(projectSlug, databaseSlug, { name, columns, customViews, customViewId }) {
  const project = findProject(projectSlug);
  if (!project) throw new Error("project not found");
  if (!project.databases) project.databases = [];
  let db = findDatabase(project, databaseSlug);
  if (!db) {
    db = {
      slug: databaseSlug,
      name: name || databaseSlug,
      columns: [],
      items: [],
      customViews: normalizeCustomViews(null),
      customViewId: DEFAULT_CUSTOM_VIEW_ID,
    };
    project.databases.push(db);
  }
  db.name = name || db.name || databaseSlug;
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

function createDatabase(projectSlug, name) {
  const project = findProject(projectSlug);
  const dSlug = slugify(name);
  writeDatabase(projectSlug, dSlug, {
    name,
    columns: DEFAULT_DB_COLS,
    customViews: normalizeCustomViews(null),
    customViewId: DEFAULT_CUSTOM_VIEW_ID,
  });
  if (project) appendTabOrder(project, "database", dSlug);
  return dSlug;
}

function uniqueNoteSlug(notesTab, title) {
  const base = slugify(title) || "note";
  const notes = notesTab.notes || [];
  if (!notes.some((n) => n.slug === base)) return base;
  let i = 2;
  while (notes.some((n) => n.slug === `${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function createNotesTab(projectSlug, name) {
  const project = findProject(projectSlug);
  if (!project) throw new Error("project not found");
  if (!project.notesTabs) project.notesTabs = [];
  const tabSlug = slugify(name);
  const existing = findNotesTab(project, tabSlug);
  if (existing) {
    existing.name = name;
    if (!existing.notes) existing.notes = [];
    appendTabOrder(project, "notes", tabSlug);
    return tabSlug;
  }
  project.notesTabs.push({ slug: tabSlug, name, notes: [] });
  appendTabOrder(project, "notes", tabSlug);
  return tabSlug;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function createFilesTab(projectSlug, name) {
  const project = findProject(projectSlug);
  if (!project) throw new Error("project not found");
  if (!project.filesTabs) project.filesTabs = [];
  const tabSlug = slugify(name);
  const existing = findFilesTab(project, tabSlug);
  if (existing) {
    existing.name = name;
    if (!existing.files) existing.files = [];
    appendTabOrder(project, "files", tabSlug);
    return tabSlug;
  }
  project.filesTabs.push({ slug: tabSlug, name, files: [] });
  appendTabOrder(project, "files", tabSlug);
  return tabSlug;
}

function uniqueFileSlug(filesTab, fileName) {
  const base = slugify(fileName) || "file";
  const files = filesTab.files || [];
  if (!files.some((f) => f.slug === base)) return base;
  let i = 2;
  while (files.some((f) => f.slug === `${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function addUploadedFile(projectSlug, filesTabSlug, { name, mime, data }) {
  const project = findProject(projectSlug);
  const tab = findFilesTab(project, filesTabSlug);
  if (!project || !tab) return { ok: false, error: "files tab not found" };
  if (!isSafePathSlug(projectSlug) || !isSafePathSlug(filesTabSlug)) {
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
  const slug = uniqueFileSlug(tab, fileName);
  if (!isSafePathSlug(slug)) return { ok: false, error: "invalid name" };
  userData.writeUpload(projectSlug, filesTabSlug, slug, buf);
  tab.files.push({
    slug,
    name: fileName,
    mime: String(mime || "application/octet-stream").slice(0, 200),
    size: buf.length,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, slug };
}

function deleteUploadedFile(projectSlug, filesTabSlug, fileSlug) {
  const project = findProject(projectSlug);
  const tab = findFilesTab(project, filesTabSlug);
  if (!project || !tab || !tab.files) return { ok: false, error: "file not found" };
  if (
    !isSafePathSlug(projectSlug) ||
    !isSafePathSlug(filesTabSlug) ||
    !isSafePathSlug(fileSlug)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const idx = tab.files.findIndex((f) => f.slug === fileSlug);
  if (idx < 0) return { ok: false, error: "file not found" };
  tab.files.splice(idx, 1);
  userData.unlinkUpload(projectSlug, filesTabSlug, fileSlug);
  return { ok: true };
}

function renameUploadedFile(projectSlug, filesTabSlug, fileSlug, name) {
  const project = findProject(projectSlug);
  const tab = findFilesTab(project, filesTabSlug);
  if (!project || !tab || !tab.files) return { ok: false, error: "file not found" };
  const meta = tab.files.find((f) => f.slug === fileSlug);
  if (!meta) return { ok: false, error: "file not found" };
  const title = String(name || "").trim();
  if (!title) return { ok: false, error: "missing fields" };
  meta.name = title;
  return { ok: true };
}

function moveUploadedFile(fromProjectSlug, fromTabSlug, fileSlug, toProjectSlug, toTabSlug) {
  if (projectIsArchived(fromProjectSlug) || projectIsArchived(toProjectSlug)) {
    return { ok: false, error: "project is archived" };
  }
  if (fromProjectSlug === toProjectSlug && fromTabSlug === toTabSlug) {
    return { ok: false, error: "same destination" };
  }
  if (
    !isSafePathSlug(fromProjectSlug) ||
    !isSafePathSlug(fromTabSlug) ||
    !isSafePathSlug(fileSlug) ||
    !isSafePathSlug(toProjectSlug) ||
    !isSafePathSlug(toTabSlug)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const fromProject = findProject(fromProjectSlug);
  const fromTab = findFilesTab(fromProject, fromTabSlug);
  const toProject = findProject(toProjectSlug);
  const toTab = findFilesTab(toProject, toTabSlug);
  if (!fromProject || !fromTab || !fromTab.files) return { ok: false, error: "file not found" };
  if (!toProject || !toTab) return { ok: false, error: "destination not found" };
  const idx = fromTab.files.findIndex((f) => f.slug === fileSlug);
  if (idx < 0) return { ok: false, error: "file not found" };
  if (!userData.uploadExists(fromProjectSlug, fromTabSlug, fileSlug)) {
    return { ok: false, error: "file not found" };
  }
  if (!toTab.files) toTab.files = [];
  let slug = fileSlug;
  if (toTab.files.some((f) => f.slug === slug)) {
    slug = uniqueFileSlug(toTab, fromTab.files[idx].name || slug);
  }
  if (!isSafePathSlug(slug)) return { ok: false, error: "invalid name" };
  const moved = userData.moveUpload(
    fromProjectSlug,
    fromTabSlug,
    fileSlug,
    toProjectSlug,
    toTabSlug,
    slug
  );
  if (!moved.ok) return moved;
  const [meta] = fromTab.files.splice(idx, 1);
  toTab.files.push({
    slug,
    name: meta.name || slug,
    mime: meta.mime || "application/octet-stream",
    size: Number(meta.size) || 0,
    createdAt: meta.createdAt || new Date().toISOString(),
  });
  return { ok: true, slug, project: toProjectSlug, filesTab: toTabSlug };
}

function readUploadedFile(projectSlug, filesTabSlug, fileSlug) {
  const project = findProject(projectSlug);
  const tab = findFilesTab(project, filesTabSlug);
  if (!project || !tab || !tab.files) return { ok: false, error: "file not found" };
  if (
    !isSafePathSlug(projectSlug) ||
    !isSafePathSlug(filesTabSlug) ||
    !isSafePathSlug(fileSlug)
  ) {
    return { ok: false, error: "invalid path" };
  }
  const meta = tab.files.find((f) => f.slug === fileSlug);
  if (!meta) return { ok: false, error: "file not found" };
  const body = userData.readUpload(projectSlug, filesTabSlug, fileSlug);
  if (!body) return { ok: false, error: "file not found" };
  return {
    ok: true,
    name: meta.name || fileSlug,
    mime: meta.mime || "application/octet-stream",
    body,
  };
}

function writeNote(projectSlug, notesTabSlug, { slug, title, body }) {
  const project = findProject(projectSlug);
  const tab = findNotesTab(project, notesTabSlug);
  if (!project || !tab) throw new Error("notes tab not found");
  if (!tab.notes) tab.notes = [];
  const now = new Date().toISOString();
  let note = tab.notes.find((n) => n.slug === slug);
  if (!note) {
    note = {
      slug,
      title: title || slug,
      body: body || "",
      createdAt: now,
      updatedAt: now,
    };
    tab.notes.push(note);
  } else {
    if (title != null) note.title = String(title).trim() || note.title || slug;
    if (body != null) note.body = String(body);
    if (!note.createdAt) note.createdAt = note.updatedAt || now;
    note.updatedAt = now;
  }
  return slug;
}

function deleteNote(projectSlug, notesTabSlug, noteSlug) {
  if (!softDeleteNote(projectSlug, notesTabSlug, noteSlug)) {
    return { ok: false, error: "note not found" };
  }
  return { ok: true };
}

function moveNote(fromProjectSlug, fromTabSlug, noteSlug, toProjectSlug, toTabSlug) {
  if (projectIsArchived(fromProjectSlug) || projectIsArchived(toProjectSlug)) {
    return { ok: false, error: "project is archived" };
  }
  if (
    fromProjectSlug === toProjectSlug &&
    fromTabSlug === toTabSlug
  ) {
    return { ok: false, error: "same destination" };
  }
  const fromProject = findProject(fromProjectSlug);
  const fromTab = findNotesTab(fromProject, fromTabSlug);
  const toProject = findProject(toProjectSlug);
  const toTab = findNotesTab(toProject, toTabSlug);
  if (!fromProject || !fromTab) return { ok: false, error: "note not found" };
  if (!toProject || !toTab) return { ok: false, error: "destination not found" };
  if (!fromTab.notes) return { ok: false, error: "note not found" };
  const idx = fromTab.notes.findIndex((n) => n.slug === noteSlug);
  if (idx < 0) return { ok: false, error: "note not found" };
  const [note] = fromTab.notes.splice(idx, 1);
  if (!toTab.notes) toTab.notes = [];
  let slug = note.slug || slugify(note.title || "note") || "note";
  if (toTab.notes.some((n) => n.slug === slug)) {
    slug = uniqueNoteSlug(toTab, note.title || slug);
  }
  const now = new Date().toISOString();
  toTab.notes.push({
    slug,
    title: note.title || slug,
    body: note.body || "",
    createdAt: note.createdAt || note.updatedAt || now,
    updatedAt: now,
  });
  return {
    ok: true,
    slug,
    project: toProjectSlug,
    notesTab: toTabSlug,
  };
}

function writeItem(projectSlug, databaseSlug, item, columns) {
  const project = findProject(projectSlug);
  const db = findDatabase(project, databaseSlug);
  if (!project || !db) throw new Error("database not found");
  if (!db.items) db.items = [];
  const cols = columns || DEFAULT_DB_COLS;
  const fieldsIn = item.fields || {};
  const title = fieldsIn.n || fieldsIn.title || item.slug || "item";
  const slug = item.slug || slugify(title);
  let existing = db.items.find((it) => it.slug === slug);
  if (!existing) {
    existing = { slug, fields: {}, body: "" };
    db.items.push(existing);
  }
  const fields = {};
  cols.forEach((c) => { fields[c.id] = fieldsIn[c.id] != null ? fieldsIn[c.id] : ""; });
  Object.keys(fieldsIn).forEach((k) => { if (fields[k] === undefined) fields[k] = fieldsIn[k]; });
  existing.fields = fields;
  existing.body = item.body || "";
  return slug;
}

function readTimelogs() {
  const entries = (store.timelogs || []).map((t) => ({
    slug: t.slug,
    project: t.project || "",
    board: t.board || "",
    card: t.card || "",
    title: t.title || t.card || "Untitled",
    projectName: t.projectName || t.project || "",
    boardName: t.boardName || t.board || "",
    color: t.color || "#9a5b2e",
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
  const base = slugify(
    [
      String(startedAt).slice(0, 10),
      entry.project || "project",
      entry.card || entry.title || "session",
    ].join("-")
  );
  const slug = uniqueTimelogSlug(base);
  const data = {
    slug,
    project: entry.project || "",
    board: entry.board || "",
    card: entry.card || "",
    title: entry.title || entry.card || "Untitled",
    projectName: entry.projectName || entry.project || "",
    boardName: entry.boardName || entry.board || "",
    color: entry.color || "#9a5b2e",
    kind: entry.kind || "pomodoro",
    note: typeof entry.note === "string" ? entry.note : "",
    startedAt,
    endedAt,
    durationSec,
  };
  store.timelogs.push(data);
  return { ...data };
}

function updateTimelog(slug, patch) {
  if (!store.timelogs) store.timelogs = [];
  const idx = store.timelogs.findIndex((t) => t.slug === slug);
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

function deleteTimelog(slug) {
  if (!store.timelogs) store.timelogs = [];
  const before = store.timelogs.length;
  store.timelogs = store.timelogs.filter((t) => t.slug !== slug);
  return store.timelogs.length < before;
}

function revealPath(targetPath, { select = false } = {}) {
  try {
    const electron = require("electron");
    const shell = electron && electron.shell;
    if (select && shell && typeof shell.showItemInFolder === "function") {
      shell.showItemInFolder(targetPath);
      return Promise.resolve("");
    }
    if (!select && shell && typeof shell.openPath === "function") {
      return shell.openPath(targetPath);
    }
  } catch {
    /* fall through to OS opener */
  }
  const { spawn } = require("child_process");
  const cmd = select
    ? process.platform === "darwin"
      ? ["open", ["-R", targetPath]]
      : process.platform === "win32"
        ? ["explorer", ["/select,", targetPath]]
        : ["xdg-open", [path.dirname(targetPath)]]
    : process.platform === "darwin"
      ? ["open", [targetPath]]
      : process.platform === "win32"
        ? ["explorer", [targetPath]]
        : ["xdg-open", [targetPath]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref();
  return Promise.resolve("");
}

function revealUserDataDir() {
  if (!userData.persistent) {
    return Promise.reject(new Error("no on-disk user data in this mode"));
  }
  const dir = userData.ensureUserDataDir();
  return revealPath(dir);
}

function revealUploadedFile(projectSlug, filesTabSlug, fileSlug) {
  if (!userData.persistent) return { ok: false, error: "no on-disk user data in this mode" };
  const result = readUploadedFile(projectSlug, filesTabSlug, fileSlug);
  if (!result.ok) return result;
  const filePath = userData.uploadPath(projectSlug, filesTabSlug, fileSlug);
  if (!filePath) return { ok: false, error: "file not found" };
  revealPath(filePath, { select: true });
  return { ok: true };
}

function revealFilesTabDir(projectSlug, filesTabSlug) {
  if (!userData.persistent) return { ok: false, error: "no on-disk user data in this mode" };
  const project = findProject(projectSlug);
  const tab = findFilesTab(project, filesTabSlug);
  if (!tab) return { ok: false, error: "files tab not found" };
  if (!isSafePathSlug(projectSlug) || !isSafePathSlug(filesTabSlug)) {
    return { ok: false, error: "invalid path" };
  }
  userData.ensureUploadDir(projectSlug, filesTabSlug);
  const dir = userData.uploadDir(projectSlug, filesTabSlug);
  revealPath(dir);
  return { ok: true, dir };
}

function isDesktopApp() {
  return Boolean(process.versions && process.versions.electron);
}

function defaultAppSettings() {
  return {
    autoBackup: {
      enabled: false,
      folderPath: "",
      lastBackupAt: null,
      lastError: null,
    },
  };
}

function normalizeAppSettings(raw) {
  const base = defaultAppSettings();
  const ab = raw && typeof raw === "object" ? raw.autoBackup : null;
  if (!ab || typeof ab !== "object") return base;
  return {
    autoBackup: {
      enabled: !!ab.enabled,
      folderPath: typeof ab.folderPath === "string" ? ab.folderPath.trim() : "",
      lastBackupAt: typeof ab.lastBackupAt === "string" ? ab.lastBackupAt : null,
      lastError: typeof ab.lastError === "string" ? ab.lastError : null,
    },
  };
}

function loadAppSettings() {
  try {
    const raw = userData.readAppSettingsFile();
    if (!raw) return defaultAppSettings();
    return normalizeAppSettings(raw);
  } catch {
    return defaultAppSettings();
  }
}

function saveAppSettings(settings) {
  const next = normalizeAppSettings(settings);
  userData.writeAppSettingsFile(next);
  return next;
}

function localDayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function backupZipFilenameForDay(stamp = localDayStamp()) {
  return `${AUTO_BACKUP_PREFIX}${stamp}${AUTO_BACKUP_SUFFIX}`;
}

function backupZipPathForDay(folderPath, stamp = localDayStamp()) {
  return path.join(folderPath, backupZipFilenameForDay(stamp));
}

function listDayBackupZips(folderPath) {
  let names;
  try {
    names = fs.readdirSync(folderPath);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const m = AUTO_BACKUP_DAY_RE.exec(name);
    if (!m) continue;
    const full = path.join(folderPath, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    out.push({ stamp: m[1], name, path: full });
  }
  out.sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
  return out;
}

function pruneDayBackups(folderPath, keep = AUTO_BACKUP_KEEP_DAYS) {
  const files = listDayBackupZips(folderPath);
  const removed = [];
  while (files.length > keep) {
    const oldest = files.shift();
    try {
      fs.rmSync(oldest.path, { force: true });
      removed.push(oldest.name);
    } catch {
      /* ignore */
    }
  }
  return removed;
}

function validateBackupFolder(folderPath) {
  const dir = String(folderPath || "").trim();
  if (!dir) return { ok: false, error: "backup folder not set" };
  if (!path.isAbsolute(dir)) return { ok: false, error: "backup folder must be an absolute path" };
  if (!fs.existsSync(dir)) return { ok: false, error: "backup folder does not exist" };
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    return { ok: false, error: "cannot access backup folder" };
  }
  if (!st.isDirectory()) return { ok: false, error: "backup path is not a folder" };
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return { ok: false, error: "backup folder is not writable" };
  }
  return { ok: true, dir };
}

function writeWorkspaceZip(destZip) {
  if (!store) throw new Error("store not initialized");
  const zip = new AdmZip();
  const wsBody = JSON.stringify(store, null, 2) + "\n";
  zip.addFile("userWorkspace.json", Buffer.from(wsBody, "utf8"));
  userData.appendUploadsToZip(zip);
  const tmp = destZip + ".tmp";
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  zip.writeZip(tmp);
  fs.renameSync(tmp, destZip);
}

let backupInFlight = false;

function runAutoBackup() {
  if (!isDesktopApp()) {
    return { ok: false, error: "auto backup is desktop only" };
  }
  if (backupInFlight) return { ok: false, error: "backup already in progress", busy: true };
  const settings = loadAppSettings();
  const ab = settings.autoBackup;
  if (!ab.enabled) {
    return { ok: false, error: "auto backup is disabled", disabled: true };
  }
  const folder = validateBackupFolder(ab.folderPath);
  if (!folder.ok) {
    const next = saveAppSettings({
      ...settings,
      autoBackup: { ...ab, lastError: folder.error },
    });
    return { ok: false, error: folder.error, settings: next };
  }
  backupInFlight = true;
  try {
    const stamp = localDayStamp();
    const dest = backupZipPathForDay(folder.dir, stamp);
    writeWorkspaceZip(dest);
    pruneDayBackups(folder.dir, AUTO_BACKUP_KEEP_DAYS);
    const next = saveAppSettings({
      ...settings,
      autoBackup: {
        ...ab,
        folderPath: folder.dir,
        lastBackupAt: new Date().toISOString(),
        lastError: null,
      },
    });
    return { ok: true, file: dest, filename: path.basename(dest), settings: next };
  } catch (e) {
    const msg = String(e.message || e);
    const next = saveAppSettings({
      ...settings,
      autoBackup: { ...ab, lastError: msg },
    });
    return { ok: false, error: msg, settings: next };
  } finally {
    backupInFlight = false;
  }
}

function isSafeZipEntryName(name) {
  if (!name || typeof name !== "string") return false;
  if (path.isAbsolute(name)) return false;
  if (name.includes("\0")) return false;
  const norm = name.replace(/\\/g, "/");
  if (norm.split("/").some((p) => p === "..")) return false;
  return norm === "userWorkspace.json" || norm === "uploads" || norm.startsWith("uploads/");
}

function extractBackupZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  let hasWorkspace = false;
  for (const entry of entries) {
    const name = String(entry.entryName || "").replace(/\\/g, "/");
    if (!isSafeZipEntryName(name)) {
      throw new Error("backup contains unsafe paths");
    }
    if (name === "userWorkspace.json" && !entry.isDirectory) hasWorkspace = true;
  }
  if (!hasWorkspace) throw new Error("backup missing userWorkspace.json");
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of entries) {
    const name = String(entry.entryName || "").replace(/\\/g, "/");
    if (!isSafeZipEntryName(name)) continue;
    const target = path.join(destDir, ...name.split("/"));
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
}

function importFromBackupZip(zipPath) {
  if (!isDesktopApp()) return { ok: false, error: "import is desktop only" };
  const file = String(zipPath || "").trim();
  if (!file) return { ok: false, error: "missing backup file" };
  if (!path.isAbsolute(file)) return { ok: false, error: "backup path must be absolute" };
  if (!file.toLowerCase().endsWith(".zip")) return { ok: false, error: "backup must be a .zip file" };
  if (!fs.existsSync(file)) return { ok: false, error: "backup file not found" };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-restore-"));
  try {
    extractBackupZip(file, tmp);
    const wsFile = path.join(tmp, "userWorkspace.json");
    const result = readJsonFile(wsFile);
    if (!result.ok) return { ok: false, error: `invalid workspace in backup (${result.reason})` };
    clearUploads();
    userData.replaceUploadsFromDirectory(path.join(tmp, "uploads"));
    store = deepClone(result.doc);
    ensureTrash();
    saveStore();
    return { ok: true, workspace: readWorkspace() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function electronOpenDialog(options) {
  if (!isDesktopApp()) return { ok: false, error: "desktop only" };
  let dialog;
  let BrowserWindow;
  try {
    const electron = require("electron");
    dialog = electron.dialog;
    BrowserWindow = electron.BrowserWindow;
  } catch {
    return { ok: false, error: "electron dialog unavailable" };
  }
  if (!dialog || typeof dialog.showOpenDialog !== "function") {
    return { ok: false, error: "electron dialog unavailable" };
  }
  const win = BrowserWindow && typeof BrowserWindow.getFocusedWindow === "function"
    ? BrowserWindow.getFocusedWindow()
    : null;
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return { ok: false, cancelled: true };
  }
  return { ok: true, path: result.filePaths[0] };
}

function pickBackupFolder() {
  return electronOpenDialog({
    title: "Choose auto-backup folder",
    properties: ["openDirectory", "createDirectory"],
  });
}

function pickBackupZip() {
  return electronOpenDialog({
    title: "Import workspace",
    properties: ["openFile"],
    filters: [{ name: "Project Binder backup", extensions: ["zip"] }],
  });
}

function backupApiMeta(ab) {
  return {
    filename: AUTO_BACKUP_FILENAME_PATTERN,
    keepDays: AUTO_BACKUP_KEEP_DAYS,
    intervalMs: AUTO_BACKUP_INTERVAL_MS,
    ...ab,
  };
}

function startAutoBackupScheduler() {
  if (!isDesktopApp()) return;
  const tick = () => {
    const settings = loadAppSettings();
    if (!settings.autoBackup.enabled || !settings.autoBackup.folderPath) return;
    runAutoBackup();
  };
  setTimeout(tick, 1500);
  setInterval(tick, AUTO_BACKUP_INTERVAL_MS);
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
    if (req.method === "GET" && url.pathname === "/api/user-data") {
      return json(res, 200, {
        persistent: userData.persistent,
        dir: USER_DATA_DIR,
        file: USER_WORKSPACE,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/user-data/reveal") {
      if (!userData.persistent) {
        return json(res, 400, { error: "no on-disk user data in this mode" });
      }
      await revealUserDataDir();
      return json(res, 200, { ok: true, dir: USER_DATA_DIR });
    }
    if (req.method === "GET" && url.pathname === "/api/export") {
      const body = JSON.stringify(store, null, 2) + "\n";
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="userWorkspace.json"',
        "Cache-Control": "no-store",
      });
      res.end(body);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/app") {
      return json(res, 200, {
        desktop: isDesktopApp(),
        persistentUserData: userData.persistent,
        autoBackupFilename: AUTO_BACKUP_FILENAME_PATTERN,
        autoBackupKeepDays: AUTO_BACKUP_KEEP_DAYS,
        autoBackupIntervalMs: AUTO_BACKUP_INTERVAL_MS,
        backup: loadAppSettings().autoBackup,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/backup") {
      if (!isDesktopApp()) return json(res, 403, { error: "desktop only" });
      return json(res, 200, {
        desktop: true,
        ...backupApiMeta(loadAppSettings().autoBackup),
      });
    }
    if (req.method === "PUT" && url.pathname === "/api/backup") {
      if (!isDesktopApp()) return json(res, 403, { error: "desktop only" });
      const body = await readBody(req);
      const cur = loadAppSettings();
      const nextAb = {
        ...cur.autoBackup,
        enabled: body.enabled != null ? !!body.enabled : cur.autoBackup.enabled,
        folderPath:
          body.folderPath != null
            ? String(body.folderPath || "").trim()
            : cur.autoBackup.folderPath,
      };
      if (nextAb.enabled && nextAb.folderPath) {
        const folder = validateBackupFolder(nextAb.folderPath);
        if (!folder.ok) return json(res, 400, { error: folder.error });
        nextAb.folderPath = folder.dir;
      }
      saveAppSettings({ ...cur, autoBackup: nextAb });
      let backupResult = null;
      if (nextAb.enabled && nextAb.folderPath) {
        backupResult = runAutoBackup();
      }
      const ab = (backupResult && backupResult.settings
        ? backupResult.settings
        : loadAppSettings()
      ).autoBackup;
      return json(res, 200, {
        ...backupApiMeta(ab),
        backupOk: !!(backupResult && backupResult.ok),
        backupError: backupResult && !backupResult.ok ? backupResult.error : null,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/backup/now") {
      if (!isDesktopApp()) return json(res, 403, { error: "desktop only" });
      const result = runAutoBackup();
      if (!result.ok && !result.busy && !result.disabled) {
        return json(res, 400, result);
      }
      if (!result.ok) return json(res, 400, result);
      return json(res, 200, {
        ok: true,
        file: result.file,
        ...backupApiMeta(
          result.settings ? result.settings.autoBackup : loadAppSettings().autoBackup
        ),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/backup/pick-folder") {
      if (!isDesktopApp()) return json(res, 403, { error: "desktop only" });
      const picked = await pickBackupFolder();
      if (picked.cancelled) return json(res, 200, { ok: false, cancelled: true });
      if (!picked.ok) return json(res, 400, picked);
      return json(res, 200, picked);
    }
    if (
      req.method === "POST" &&
      (url.pathname === "/api/backup/import" || url.pathname === "/api/backup/restore")
    ) {
      if (!isDesktopApp()) return json(res, 403, { error: "desktop only" });
      const body = await readBody(req);
      let zipPath = String(body.path || "").trim();
      if (!zipPath) {
        const picked = await pickBackupZip();
        if (picked.cancelled) return json(res, 200, { ok: false, cancelled: true });
        if (!picked.ok) return json(res, 400, picked);
        zipPath = picked.path;
      }
      const result = importFromBackupZip(zipPath);
      if (!result.ok) return json(res, 400, result);
      return json(res, 200, result.workspace);
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
      const slug = createProject({
        name,
        color: body.color,
        cover: body.cover,
      });
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/project") {
      const body = await readBody(req);
      if (!body.project) return json(res, 400, { error: "missing fields" });
      if (!findProject(body.project)) {
        return json(res, 404, { error: "project not found" });
      }
      if (projectIsArchived(body.project) && body.archived !== false) {
        if (body.archived === true) {
          writeProject(body.project, { archived: true });
          saveStore();
          return json(res, 200, readWorkspace());
        }
        return json(res, 403, { error: "project is archived" });
      }
      writeProject(body.project, {
        name: body.name,
        color: body.color,
        cover: body.cover,
        archived: body.archived,
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
      const slug = writeCard(body.project, body.board, body);
      saveStore();
      return json(res, 200, { slug, ...readWorkspace() });
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
      if (!body.project || !body.board || !body.slug) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      deleteCard(body.project, body.board, body.slug, { permanent: !!body.permanent });
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "GET" && url.pathname === "/api/trash") {
      return json(res, 200, { trash: readTrash() });
    }
    if (req.method === "POST" && url.pathname === "/api/trash/restore") {
      const body = await readBody(req);
      if (!body.slug) return json(res, 400, { error: "missing fields" });
      const result = restoreTrashItem(body.slug, { restoreParent: !!body.restoreParent });
      if (result.needsParent) {
        return json(res, 409, {
          needsParent: true,
          parentKind: result.parentKind,
          parentName: result.parentName,
          parentTrashSlug: result.parentTrashSlug,
          error: "parent container is in trash",
        });
      }
      if (!result.ok) {
        const status = result.error === "not found" ? 404 : result.error === "project is archived" ? 403 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, {
        slug: result.slug,
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
      const slug = uniqueCardSlug(board, body.title);
      writeCard(body.project, body.board, { ...body, slug });
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/board") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      const slug = createBoard(body.project, body.name);
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
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
      const slug = createDatabase(body.project, body.name);
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/notes-tab") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      const slug = createNotesTab(body.project, body.name);
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/files-tab") {
      const body = await readBody(req);
      if (!body.project || !body.name) return json(res, 400, { error: "missing fields" });
      if (!findProject(body.project)) return json(res, 404, { error: "project not found" });
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const slug = createFilesTab(body.project, body.name);
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
    }
    if (req.method === "POST" && url.pathname === "/api/file/reveal") {
      const body = await readBody(req);
      const result = revealUploadedFile(body.project, body.filesTab, body.file);
      if (!result.ok) {
        const status = result.error === "file not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/files-tab/reveal") {
      const body = await readBody(req);
      const result = revealFilesTabDir(body.project, body.filesTab);
      if (!result.ok) {
        const status = result.error === "files tab not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      return json(res, 200, { ok: true });
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
        slug: result.slug,
        project: result.project,
        filesTab: result.filesTab,
        ...readWorkspace(),
      });
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
      return json(res, 201, { slug: result.slug, ...readWorkspace() });
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
      if (!body.project || !body.type || !body.slug || body.name == null) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = renameTab(body.project, body.type, body.slug, body.name);
      if (!result.ok) {
        const status = result.error === "project not found" || result.error === "tab not found" ? 404 : 400;
        return json(res, status, { error: result.error });
      }
      saveStore();
      return json(res, 200, readWorkspace());
    }
    if (req.method === "DELETE" && url.pathname === "/api/tab") {
      const body = await readBody(req);
      if (!body.project || !body.type || !body.slug) {
        return json(res, 400, { error: "missing fields" });
      }
      if (projectIsArchived(body.project)) return json(res, 403, { error: "project is archived" });
      const result = deleteTab(body.project, body.type, body.slug);
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
      const slug = uniqueNoteSlug(tab, title);
      const noteBody =
        body.body != null ? String(body.body) : "<h1></h1>";
      writeNote(body.project, body.notesTab, { slug, title, body: noteBody });
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
    }
    if (req.method === "PUT" && url.pathname === "/api/note") {
      const body = await readBody(req);
      if (!body.project || !body.notesTab || !body.note) {
        return json(res, 400, { error: "missing fields" });
      }
      const tab = findNotesTab(findProject(body.project), body.notesTab);
      if (!tab || !(tab.notes || []).some((n) => n.slug === body.note)) {
        return json(res, 404, { error: "note not found" });
      }
      writeNote(body.project, body.notesTab, {
        slug: body.note,
        title: body.title,
        body: body.body,
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
        slug: result.slug,
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
      const slug = writeItem(body.project, body.database, body, cols);
      saveStore();
      return json(res, 200, { slug, ...readWorkspace() });
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
      const slug = uniqueItemSlug(db, fields.n || fields.title || "item");
      writeItem(body.project, body.database, { slug, fields, body: body.body || "" }, cols);
      saveStore();
      return json(res, 201, { slug, ...readWorkspace() });
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
      if (!body.slug) return json(res, 400, { error: "missing fields" });
      const { slug, ...patch } = body;
      const entry = updateTimelog(slug, patch);
      if (!entry) return json(res, 404, { error: "timelog not found" });
      saveStore();
      return json(res, 200, { entry, timelogs: readTimelogs() });
    }
    if (req.method === "DELETE" && url.pathname === "/api/timelog") {
      const body = await readBody(req);
      if (!body.slug) return json(res, 400, { error: "missing fields" });
      if (!deleteTimelog(body.slug)) return json(res, 404, { error: "timelog not found" });
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
  if (isDesktopApp() && userData.persistent) {
    console.log(`Auto backup: desktop enabled (every ${AUTO_BACKUP_INTERVAL_MS / 60000} min)`);
    startAutoBackupScheduler();
  }
});
