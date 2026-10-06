#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const APP_USER_DATA_NAME = "Project Binder";
const SEED_WORKSPACE = path.join(__dirname, "seedWorkspace.json");
const LEGACY_SEED = path.join(__dirname, "launchData.json");
const LEGACY_APP_USER_WORKSPACE = path.join(__dirname, "userWorkspace.json");
const LEGACY_USER = path.join(__dirname, "userData.json");
const { USER_DATA_DIR, USER_WORKSPACE } = resolveUserPaths();
const PORT = 3456;
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

function createDefaultCustomView(filters, hiddenCols) {
  return {
    id: DEFAULT_CUSTOM_VIEW_ID,
    name: DEFAULT_CUSTOM_VIEW_NAME,
    filters: normalizeFilters(filters),
    hiddenCols: normalizeHiddenCols(hiddenCols),
  };
}

function normalizeCustomViews(views) {
  const extras = [];
  let defaultFilters = emptyFilterState();
  let defaultHiddenCols = [];
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.id == null) continue;
    const id = String(v.id);
    if (id === DEFAULT_CUSTOM_VIEW_ID) {
      defaultFilters = normalizeFilters(v.filters);
      defaultHiddenCols = normalizeHiddenCols(v.hiddenCols);
      continue;
    }
    extras.push({
      id,
      name: String(v.name || "Untitled view").trim() || "Untitled view",
      filters: normalizeFilters(v.filters),
      hiddenCols: normalizeHiddenCols(v.hiddenCols),
    });
  }
  return [createDefaultCustomView(defaultFilters, defaultHiddenCols), ...extras];
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

/** Same location Electron uses for app.getPath('userData') with this app name. */
function defaultUserDataDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_USER_DATA_NAME);
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      APP_USER_DATA_NAME
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    APP_USER_DATA_NAME
  );
}

function resolveUserPaths() {
  const envDir = String(process.env.PROJECT_BINDER_USER_DATA || "").trim();
  let dir = envDir;
  if (!dir) {
    try {
      const electron = require("electron");
      const app = electron && electron.app;
      if (app && typeof app.getPath === "function") {
        dir = app.getPath("userData");
      }
    } catch {
      /* not running inside Electron */
    }
  }
  if (!dir) dir = defaultUserDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return { USER_DATA_DIR: dir, USER_WORKSPACE: path.join(dir, "userWorkspace.json") };
}

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

function isValidStore(doc) {
  return (
    doc &&
    typeof doc === "object" &&
    doc.version != null &&
    Array.isArray(doc.stages) &&
    Array.isArray(doc.projects) &&
    Array.isArray(doc.timelogs)
  );
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

function atomicWrite(file, doc) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function migrateLegacyWorkspaceFiles() {
  if (!fs.existsSync(SEED_WORKSPACE) && fs.existsSync(LEGACY_SEED)) {
    fs.renameSync(LEGACY_SEED, SEED_WORKSPACE);
  }
  if (fs.existsSync(USER_WORKSPACE)) return;
  const candidates = [LEGACY_APP_USER_WORKSPACE, LEGACY_USER];
  for (const src of candidates) {
    if (!src || src === USER_WORKSPACE || !fs.existsSync(src)) continue;
    fs.copyFileSync(src, USER_WORKSPACE);
    return;
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

function stripProjectIcons(doc) {
  let changed = false;
  for (const p of doc.projects || []) {
    if (p && Object.prototype.hasOwnProperty.call(p, "icon")) {
      delete p.icon;
      changed = true;
    }
  }
  return changed;
}

function saveStore() {
  if (!store) throw new Error("store not initialized");
  stripProjectIcons(store);
  atomicWrite(USER_WORKSPACE, store);
}

function ensureStore() {
  migrateLegacyWorkspaceFiles();
  const user = readJsonFile(USER_WORKSPACE);
  if (user.ok) {
    store = deepClone(user.doc);
    const stripped = stripProjectIcons(store);
    ensureTrash();
    const purged = purgeExpiredTrash();
    if (purged || stripped) saveStore();
    return { reseeded: false, purged };
  }
  store = loadSeedWorkspace();
  ensureTrash();
  saveStore();
  return { reseeded: true, reason: user.reason, purged: 0 };
}

function resetToSeedWorkspace() {
  store = loadSeedWorkspace();
  ensureTrash();
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

function tabKey(type, slug) {
  return `${type}:${slug}`;
}

function defaultTabOrderEntries(project) {
  return [
    ...(project.boards || []).map((b) => ({ type: "board", slug: b.slug })),
    ...(project.notesTabs || []).map((t) => ({ type: "notes", slug: t.slug })),
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
  return { ok: false, error: "invalid type" };
}

function deleteTab(projectSlug, type, slug) {
  if (type === "board") return softDeleteBoard(projectSlug, slug);
  if (type === "notes") return softDeleteNotesTab(projectSlug, slug);
  // databases stay hard-delete for now (not in UI)
  const project = findProject(projectSlug);
  if (!project) return { ok: false, error: "project not found" };
  if (type === "database") {
    const idx = (project.databases || []).findIndex((d) => d.slug === slug);
    if (idx < 0) return { ok: false, error: "tab not found" };
    project.databases.splice(idx, 1);
    removeTabOrder(project, type, slug);
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
  };
  store.projects.push(project);
  return slug;
}

function deleteProject(projectSlug) {
  if (!projectSlug || projectSlug.includes("..") || projectSlug.includes("/") || projectSlug.includes("\\")) {
    return false;
  }
  const idx = store.projects.findIndex((p) => p.slug === projectSlug);
  if (idx < 0) return false;
  store.projects.splice(idx, 1);
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

function restoreBoardFromTrash(item) {
  const project = findProject(item.project);
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(item.project)) return { ok: false, error: "project is archived" };
  if (!project.boards) project.boards = [];
  let slug = item.board || slugify(item.boardName || item.title) || "board";
  if (findBoard(project, slug)) {
    // already restored
    return { ok: true, project: item.project, board: slug, slug };
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
  return { ok: true, project: item.project, board: slug, slug };
}

function restoreNotesTabFromTrash(item) {
  const project = findProject(item.project);
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(item.project)) return { ok: false, error: "project is archived" };
  if (!project.notesTabs) project.notesTabs = [];
  let slug = item.notesTab || slugify(item.notesTabName || item.title) || "notes";
  if (findNotesTab(project, slug)) {
    return { ok: true, project: item.project, notesTab: slug, slug };
  }
  project.notesTabs.push({
    slug,
    name: item.notesTabName || item.title || slug,
    notes: [],
  });
  appendTabOrder(project, "notes", slug);
  const trashIdx = store.trash.findIndex((t) => t.slug === item.slug);
  if (trashIdx >= 0) store.trash.splice(trashIdx, 1);
  return { ok: true, project: item.project, notesTab: slug, slug };
}

function restoreCardFromTrash(item, { restoreParent = false } = {}) {
  const project = findProject(item.project);
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(item.project)) return { ok: false, error: "project is archived" };
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
  return { ok: true, project: item.project, board: item.board, slug };
}

function restoreNoteFromTrash(item, { restoreParent = false } = {}) {
  const project = findProject(item.project);
  if (!project) return { ok: false, error: "project not found" };
  if (projectIsArchived(item.project)) return { ok: false, error: "project is archived" };
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
  return { ok: true, project: item.project, notesTab: item.notesTab, slug };
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
  if (kind === "board") return restoreBoardFromTrash(item);
  if (kind === "notesTab") return restoreNotesTabFromTrash(item);
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
  if (patch && Object.prototype.hasOwnProperty.call(patch, "note")) {
    cur.note = typeof patch.note === "string" ? patch.note : "";
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

function revealUserDataDir() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  try {
    const electron = require("electron");
    const shell = electron && electron.shell;
    if (shell && typeof shell.openPath === "function") {
      return shell.openPath(USER_DATA_DIR);
    }
  } catch {
    /* fall through to OS opener */
  }
  const { spawn } = require("child_process");
  const cmd =
    process.platform === "darwin"
      ? ["open", [USER_DATA_DIR]]
      : process.platform === "win32"
        ? ["explorer", [USER_DATA_DIR]]
        : ["xdg-open", [USER_DATA_DIR]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref();
  return Promise.resolve("");
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
      return json(res, 200, { dir: USER_DATA_DIR, file: USER_WORKSPACE });
    }
    if (req.method === "POST" && url.pathname === "/api/user-data/reveal") {
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
      if (!deleteProject(body.project)) return json(res, 404, { error: "project not found" });
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
      const entry = updateTimelog(body.slug, { note: body.note });
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
  console.log(`User data: ${USER_DATA_DIR}`);
  console.log(`User workspace: ${USER_WORKSPACE}`);
  console.log(`Seed workspace (read-only): ${SEED_WORKSPACE}`);
  if (boot.reseeded) console.log(`Seeded userWorkspace.json from seedWorkspace.json (${boot.reason})`);
  if (boot.purged) console.log(`Purged ${boot.purged} trash item(s) older than 30 days`);
});
