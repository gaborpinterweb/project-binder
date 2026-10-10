import { askConfirm } from "./confirmDialog.js";
import { normalizeDbCol } from "./dbFields.js";
import { normalizeCustomViews, resolveCustomViewId } from "./dbViews.js";

export const STAGES = ["Backlog", "This week", "Today", "Tomorrow", "Next week"];
export const APP_NAME = "Project Binder";
export const APP_VERSION = "0.1.0";

export const TYPES = [
  { t: "Board", title: "Tasks", sub: "Kanban columns with cards" },
  { t: "Notes", title: "Notes", sub: "Rich text editor with notes list" },
  { t: "Files", title: "Files", sub: "Documents, assets, and other uploads" },
  { t: "Database", title: "Records", sub: "Databse with custom schema" },
  { t: "Docs", title: "Docs", sub: "Knowledge base notes and briefs", off: true },
  { t: "Links", title: "Links", sub: "Stakeholders and key references", off: true },
  { t: "Chat", title: "Chat", sub: "Communication channels and threads", off: true },
  { t: "Iframe", title: "Iframe", sub: "Embed Google Docs and pages", off: true },
  { t: "Changelog", title: "Changelog", sub: "Release notes and product updates", off: true },
  { t: "Workflows", title: "Workflows", sub: "Trigger remote workers", off: true },
];

const STORAGE_PREFIX = "project-binder:";

const LAST_TAB_KEY = `${STORAGE_PREFIX}lastTab`;
const SESSION_KEY = `${STORAGE_PREFIX}session`;
export const COMPLETED_VIEW_KEY = `${STORAGE_PREFIX}completedView`;
const DB_VIEWS_SIDEBAR_KEY = `${STORAGE_PREFIX}dbViewsSidebar`;
const FILES_SORT_KEY = `${STORAGE_PREFIX}filesSort`;
const POMO_KEY = `${STORAGE_PREFIX}pomodoro`;
const OPEN_ON_LAUNCH_KEY = `${STORAGE_PREFIX}openOnLaunch`;
const UI_SOUNDS_KEY = `${STORAGE_PREFIX}uiSounds`;
const LAUNCH_SEEN_KEY = `${STORAGE_PREFIX}launchSeen`;
const OPEN_ON_LAUNCH_VALUES = ["masterboard", "last-tab"];
const DEFAULT_OPEN_ON_LAUNCH = "last-tab";
const DEFAULT_UI_SOUNDS = true;
export const WORKSPACE_ITEMS = ["Masterboard", "Timelogs", "Trash"];
export const POMO_DURATION_SEC = 25 * 60;
export const COMPLETED_VIEWS = ["hide", "virtual", "inplace"];
export const GACC = "#9a5b2e";
export const PC = [
  "#6b4f8c",
  "#2f7a6e",
  "#b45a3c",
  "#8a5c2e",
  "#3d6a8c",
  "#9a4568",
  "#5a7a38",
  "#b08a2a",
  "#4f4d8c",
  "#a63d3d",
];

export function loadStages(list, setStages) {
  if (!list || !list.length) return;
  const next = list.filter((s) => typeof s === "string" && s);
  if (setStages) setStages(next);
  return next;
}

export function fromApi(data, loadStagesFn) {
  if (data.stages && data.stages.length && loadStagesFn) loadStagesFn(data.stages);
  return (data.projects || []).map((pr) => {
    const cover = pr.cover || { values: { description: "" } };
    const boardMods = new Map();
    (pr.boards || []).forEach((b) => {
      boardMods.set(b.slug, [
        "Board",
        b.name,
        {
          slug: b.slug,
          columns: b.columns && b.columns.length ? b.columns : undefined,
          rows: (b.cards || []).map((c) => {
            const msRaw = c.master || c.status;
            const row = {
              n: c.title,
              s: c.status,
              ms: msRaw,
              slug: c.slug,
              doneAt: c.doneAt || "",
              body: c.body || "",
            };
            if (c.ord != null && c.ord !== "" && !Number.isNaN(Number(c.ord))) {
              row.ord = Number(c.ord);
            }
            return row;
          }),
        },
      ]);
    });
    const notesMods = new Map();
    (pr.notesTabs || []).forEach((nt) => {
      notesMods.set(nt.slug, [
        "Notes",
        nt.name,
        {
          slug: nt.slug,
          notes: (nt.notes || []).map((n) => ({
            slug: n.slug,
            title: n.title || n.slug,
            body: n.body || "",
            createdAt: n.createdAt || n.updatedAt || "",
            updatedAt: n.updatedAt || "",
          })),
        },
      ]);
    });
    const filesMods = new Map();
    (pr.filesTabs || []).forEach((ft) => {
      filesMods.set(ft.slug, [
        "Files",
        ft.name,
        {
          slug: ft.slug,
          files: (ft.files || []).map((f) => ({
            slug: f.slug,
            name: f.name || f.slug,
            mime: f.mime || "application/octet-stream",
            size: Number(f.size) || 0,
            createdAt: f.createdAt || "",
          })),
        },
      ]);
    });
    const dbMods = new Map();
    (pr.databases || []).forEach((db) => {
      dbMods.set(db.slug, [
        "Database",
        db.name,
        {
          slug: db.slug,
          cols: (db.columns || []).map(normalizeDbCol).filter(Boolean),
          rows: (db.items || []).map((item) => ({
            slug: item.slug,
            body: item.body || "",
            ...(item.fields || {}),
          })),
          views: [
            { n: "Table", t: "table" },
            { n: "Gallery", t: "gallery" },
          ],
          cur: 0,
          customViews: normalizeCustomViews(db.customViews),
          customViewId: resolveCustomViewId(db.customViewId, db.customViews),
        },
      ]);
    });

    const pick = (type, slug) => {
      if (type === "board") return boardMods.get(slug);
      if (type === "notes") return notesMods.get(slug);
      if (type === "files") return filesMods.get(slug);
      if (type === "database") return dbMods.get(slug);
      return null;
    };

    const mods = [
      [
        "Cover",
        "Cover",
        {
          slug: "cover",
          values: { description: (cover.values && cover.values.description) || "" },
        },
      ],
    ];
    const seen = new Set();
    const pushMod = (mod) => {
      if (!mod) return;
      const key = `${mod[0]}:${mod[2]?.slug}`;
      if (seen.has(key)) return;
      seen.add(key);
      mods.push(mod);
    };

    for (const entry of pr.tabOrder || []) {
      pushMod(pick(entry.type, entry.slug));
    }
    for (const mod of boardMods.values()) pushMod(mod);
    for (const mod of notesMods.values()) pushMod(mod);
    for (const mod of filesMods.values()) pushMod(mod);
    for (const mod of dbMods.values()) pushMod(mod);

    return {
      slug: pr.slug,
      name: pr.name,
      color: pr.color || "#9a5b2e",
      archived: !!pr.archived,
      isDemo: !!pr.isDemo,
      mods,
    };
  });
}

export function modToTabType(mod) {
  if (!mod) return null;
  if (mod[0] === "Board") return "board";
  if (mod[0] === "Notes") return "notes";
  if (mod[0] === "Files") return "files";
  if (mod[0] === "Database") return "database";
  return null;
}

export function tabsOrderPayload(mods) {
  return (mods || [])
    .map((mod) => {
      const type = modToTabType(mod);
      const slug = mod[2]?.slug;
      if (!type || !slug) return null;
      return { type, slug };
    })
    .filter(Boolean);
}

/** Normalize master stage after stages are known */
export function normalizeFolders(folders, stages) {
  const stageList = stages && stages.length ? stages : STAGES;
  return folders.map((pr) => ({
    ...pr,
    mods: pr.mods.map((mod) => {
      if (mod[0] !== "Board") return mod;
      const columns = mod[2].columns && mod[2].columns.length ? mod[2].columns : stageList.slice();
      const rows = (mod[2].rows || []).map((c) => {
        const msRaw = c.ms || c.s;
        const ms = stageList.includes(msRaw)
          ? msRaw
          : stageList.includes(c.s)
            ? c.s
            : stageList[0];
        return { ...c, ms };
      });
      return [mod[0], mod[1], { ...mod[2], columns, rows }];
    }),
  }));
}

export function boardKey(folder, mod) {
  return folder.slug + "/" + (mod[2]?.slug || mod[1]);
}

/** Project name alone when it has one Board tab; otherwise "Project · Tab". */
export function boardLabel(folder, mod) {
  const name = folder?.name || "Project";
  const boardCount = (folder?.mods || []).filter((m) => m[0] === "Board").length;
  if (boardCount <= 1) return name;
  return `${name} · ${mod?.[1] || "Tab"}`;
}

/** Card chip: "Project / Column" or "Project · Board / Column". */
export function boardColumnLabel(folder, mod, column) {
  const board = boardLabel(folder, mod);
  const col = String(column || "").trim();
  return col ? `${board} / ${col}` : board;
}

export function slugifyClient(s) {
  return (
    String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

/** Plain-text title from the first block of note HTML (h1/p/li/…). */
export function noteListTitle(body) {
  const html = String(body || "").trim();
  if (!html) return "New note...";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const first =
      doc.body.querySelector("h1, h2, h3, p, li, blockquote") ||
      doc.body.firstElementChild;
    const text = (first?.textContent || "").replace(/\s+/g, " ").trim();
    return text || "New note...";
  } catch {
    return "New note...";
  }
}

/** Plain-text preview from blocks after the first, truncated. */
export function noteListPreview(body, maxLen = 80) {
  const html = String(body || "").trim();
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = [
      ...doc.body.querySelectorAll("h1, h2, h3, p, li, blockquote"),
    ];
    if (blocks.length < 2) return "";
    const text = blocks
      .slice(1)
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
  } catch {
    return "";
  }
}

export function isEmptyNoteBody(body) {
  return noteListTitle(body) === "New note...";
}

export function isProjectArchived(folder) {
  return !!(folder && folder.archived);
}

export function isDone(row) {
  return !!(row && row.doneAt);
}

export function pastel(c) {
  return `color-mix(in srgb,${c} 32%,#fff)`;
}

function dayTitle(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function groupByDoneDay(rows) {
  const map = new Map();
  rows
    .slice()
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)))
    .forEach((r) => {
      const key = timelogDayKey(r.doneAt) || "unknown";
      if (!map.has(key)) map.set(key, { key, title: dayTitle(r.doneAt), rows: [] });
      map.get(key).rows.push(r);
    });
  return [...map.values()];
}

/** Stable sort by numeric `ord`, preserving original order when missing. */
export function byOrd(rows) {
  return (rows || [])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ao = a.r?.ord;
      const bo = b.r?.ord;
      const aMissing = ao == null || ao === "" || Number.isNaN(Number(ao));
      const bMissing = bo == null || bo === "" || Number.isNaN(Number(bo));
      if (aMissing && bMissing) return a.i - b.i;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return Number(ao) - Number(bo) || a.i - b.i;
    })
    .map(({ r }) => r);
}

export function columnRows(rows, mode) {
  const list = byOrd(rows);
  if (mode === "inplace") {
    const open = [],
      done = [];
    list.forEach((r) => (isDone(r) ? done : open).push(r));
    return { open, done, all: open.concat(done) };
  }
  const open = list.filter((r) => !isDone(r));
  return { open, done: [], all: open };
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return h + ":" + String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  return m + ":" + String(r).padStart(2, "0");
}

export function formatSpent(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return h + "h " + m + "m";
  return m + "m";
}

export function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatLocalYmd(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function timelogDayKey(iso) {
  return formatLocalYmd(new Date(iso));
}

function timelogWeekStart(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return startOfLocalWeek(d);
}

function timelogWeekKey(iso) {
  return formatLocalYmd(timelogWeekStart(iso));
}

function timelogMonthKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatTimelogDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown day";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimelogWeek(iso) {
  const start = timelogWeekStart(iso);
  if (!start) return "Unknown week";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

function formatTimelogMonth(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown month";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export const TIMELOG_GROUP_BYS = ["None", "Day", "Week", "Month"];

function timelogPeriodBucket(stamp, groupBy) {
  if (groupBy === "None") {
    return { key: "all", label: null };
  }
  if (groupBy === "Week") {
    const key = timelogWeekKey(stamp) || "unknown";
    return { key, label: formatTimelogWeek(stamp) };
  }
  if (groupBy === "Month") {
    const key = timelogMonthKey(stamp) || "unknown";
    return { key, label: formatTimelogMonth(stamp) };
  }
  const key = timelogDayKey(stamp) || "unknown";
  return { key, label: formatTimelogDay(stamp) };
}

/** Group newest-first by period (None/Day/Week/Month). */
export function groupTimelogsByPeriodAndProject(entries, groupBy = "Day") {
  const mode = TIMELOG_GROUP_BYS.includes(groupBy) ? groupBy : "Day";
  const periodMap = new Map();
  for (const entry of entries || []) {
    const stamp = entry.endedAt || entry.startedAt || "";
    const { key: periodKey, label } = timelogPeriodBucket(stamp, mode);
    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        key: periodKey,
        label,
        totalSec: 0,
        entries: [],
      });
    }
    const period = periodMap.get(periodKey);
    const dur = Math.max(0, parseInt(entry.durationSec, 10) || 0);
    period.totalSec += dur;
    period.entries.push(entry);
  }

  return [...periodMap.values()]
    .sort((a, b) => String(b.key).localeCompare(String(a.key)))
    .map((period) => ({
      key: period.key,
      label: period.label,
      totalSec: period.totalSec,
      entries: period.entries.slice().sort((a, b) =>
        String(b.endedAt || b.startedAt).localeCompare(
          String(a.endedAt || a.startedAt)
        )
      ),
    }));
}

export function formatTrashDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function matchesTimelogFilter(entry, filter) {
  if (!filter) return true;
  return entry.project === filter.project && entry.board === filter.board && entry.card === filter.card;
}

export const TIMELOG_PERIODS = [
  "Today",
  "Yesterday",
  "This week",
  "Last week",
  "This month",
  "Last month",
  "This quarter",
  "Last quarter",
  "This year",
  "Last year",
  "All time",
];

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

/** Monday-based local week start. */
function startOfLocalWeek(d) {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addLocalDays(x, diff);
}

function startOfLocalMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfLocalQuarter(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function startOfLocalYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

/** Inclusive start, exclusive end (local time). */
function timelogPeriodRange(period, now = new Date()) {
  const today = startOfLocalDay(now);
  switch (period) {
    case "Today":
      return { start: today, end: addLocalDays(today, 1) };
    case "Yesterday": {
      const start = addLocalDays(today, -1);
      return { start, end: today };
    }
    case "This week": {
      const start = startOfLocalWeek(today);
      return { start, end: addLocalDays(start, 7) };
    }
    case "Last week": {
      const end = startOfLocalWeek(today);
      return { start: addLocalDays(end, -7), end };
    }
    case "This month": {
      const start = startOfLocalMonth(today);
      return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
    }
    case "Last month": {
      const end = startOfLocalMonth(today);
      return { start: new Date(end.getFullYear(), end.getMonth() - 1, 1), end };
    }
    case "This quarter": {
      const start = startOfLocalQuarter(today);
      return { start, end: new Date(start.getFullYear(), start.getMonth() + 3, 1) };
    }
    case "Last quarter": {
      const end = startOfLocalQuarter(today);
      return { start: new Date(end.getFullYear(), end.getMonth() - 3, 1), end };
    }
    case "This year": {
      const start = startOfLocalYear(today);
      return { start, end: new Date(start.getFullYear() + 1, 0, 1) };
    }
    case "Last year": {
      const end = startOfLocalYear(today);
      return { start: new Date(end.getFullYear() - 1, 0, 1), end };
    }
    default:
      return { start: today, end: addLocalDays(today, 1) };
  }
}

export function matchesTimelogPeriod(entry, period) {
  if (!period || period === "All time" || !TIMELOG_PERIODS.includes(period)) {
    return true;
  }
  const stamp = entry.endedAt || entry.startedAt || "";
  const t = new Date(stamp).getTime();
  if (Number.isNaN(t)) return false;
  const { start, end } = timelogPeriodRange(period);
  return t >= start.getTime() && t < end.getTime();
}

export function globalLabel(name) {
  return (
    {
      Masterboard: "Master board",
    }[name] || name
  );
}

function readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadOpenOnLaunch() {
  try {
    const stored = localStorage.getItem(OPEN_ON_LAUNCH_KEY);
    if (OPEN_ON_LAUNCH_VALUES.includes(stored)) return stored;
  } catch {}
  return DEFAULT_OPEN_ON_LAUNCH;
}

export function saveOpenOnLaunch(value) {
  const next = OPEN_ON_LAUNCH_VALUES.includes(value) ? value : DEFAULT_OPEN_ON_LAUNCH;
  try {
    localStorage.setItem(OPEN_ON_LAUNCH_KEY, next);
  } catch {}
  return next;
}

export function loadUiSounds() {
  try {
    const stored = localStorage.getItem(UI_SOUNDS_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {}
  return DEFAULT_UI_SOUNDS;
}

export function saveUiSounds(enabled) {
  const next = !!enabled;
  try {
    localStorage.setItem(UI_SOUNDS_KEY, next ? "1" : "0");
  } catch {}
  return next;
}

export function playSound(src) {
  if (!loadUiSounds()) return;
  try {
    const audio = new Audio(src);
    audio.play().catch(() => {});
  } catch {}
}

export function playTaskCompleteSound() {
  playSound("/sounds/task-complete.mp3");
}

export function playTimerCompleteSound() {
  playSound("/sounds/timer-complete.mp3");
}

export function playTimerDiscardSound() {
  playSound("/sounds/timer-discard.mp3");
}

export function clearClientAppState() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {}
}

export function hasSeenLaunch() {
  try {
    return localStorage.getItem(LAUNCH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLaunchSeen() {
  try {
    localStorage.setItem(LAUNCH_SEEN_KEY, "1");
  } catch {}
}

export function colCollapseKey(scope, s) {
  return scope + "\0" + s;
}

export async function confirmDeleteColumn(name, count, target) {
  const cards = count
    ? `${count} card${count === 1 ? "" : "s"} will move to "${target}".`
    : `No cards are in this column.`;
  return askConfirm({
    title: `Delete column "${name}"?`,
    message: cards,
    confirmLabel: "Delete",
    danger: true,
  });
}

export function coverColorChoices(current) {
  const colors = PC.slice();
  if (current && !colors.includes(current)) colors.unshift(current);
  return colors;
}

export function nextUnusedProjectColor(folders) {
  const counts = new Map(PC.map((c) => [c.toLowerCase(), 0]));
  for (const folder of folders || []) {
    const color = String(folder?.color || "").trim().toLowerCase();
    if (!color) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  let best = PC[0];
  let bestCount = Infinity;
  for (const color of PC) {
    const n = counts.get(color.toLowerCase()) || 0;
    if (n < bestCount) {
      best = color;
      bestCount = n;
    }
  }
  return best;
}

export function loadLastTabs() {
  const stored = readStorageJson(LAST_TAB_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveLastTab(slug, tabSlug) {
  if (!slug || !tabSlug) return;
  const map = loadLastTabs();
  map[slug] = tabSlug;
  writeStorageJson(LAST_TAB_KEY, map);
}

const FILE_SORT_KEYS = new Set(["name", "type", "size", "added"]);
const FILE_SORT_DIRS = new Set(["asc", "desc"]);
export const DEFAULT_FILES_SORT = { key: "added", dir: "desc" };

function parseFilesSort(value) {
  const key = FILE_SORT_KEYS.has(value?.key) ? value.key : DEFAULT_FILES_SORT.key;
  const dir = FILE_SORT_DIRS.has(value?.dir) ? value.dir : DEFAULT_FILES_SORT.dir;
  return { key, dir };
}

export function loadFilesSorts() {
  const stored = readStorageJson(FILES_SORT_KEY, {});
  if (!stored || typeof stored !== "object") return {};
  const map = {};
  for (const [tabKey, value] of Object.entries(stored)) {
    if (!tabKey) continue;
    map[tabKey] = parseFilesSort(value);
  }
  return map;
}

export function saveFilesSort(tabKey, sort) {
  if (!tabKey) return;
  const map = loadFilesSorts();
  map[tabKey] = parseFilesSort(sort);
  writeStorageJson(FILES_SORT_KEY, map);
}

export function loadCompletedViews() {
  const stored = readStorageJson(COMPLETED_VIEW_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function loadDbViewsSidebar() {
  const stored = readStorageJson(DB_VIEWS_SIDEBAR_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveDbViewsSidebar(scope, open) {
  if (!scope) return;
  const map = loadDbViewsSidebar();
  map[scope] = !!open;
  writeStorageJson(DB_VIEWS_SIDEBAR_KEY, map);
}

export function loadSession() {
  return readStorageJson(SESSION_KEY, null);
}

export function saveSession(g, folders, p) {
  writeStorageJson(SESSION_KEY, {
    g: g || null,
    project: folders[p]?.slug || null,
  });
}

export function restoreTabIndex(pr) {
  if (!pr?.mods?.length) return 0;
  const want = loadLastTabs()[pr.slug];
  if (!want) return 0;
  const i = pr.mods.findIndex((mod) => mod[2]?.slug === want);
  return i >= 0 ? i : 0;
}

export function loadPomo() {
  return readStorageJson(POMO_KEY, null);
}

export function savePomo(session) {
  try {
    if (session) writeStorageJson(POMO_KEY, session);
    else localStorage.removeItem(POMO_KEY);
  } catch {}
}

export function isStoptimerSession(session) {
  return session?.kind === "stoptimer";
}

export function pomoRemainingSec(session) {
  if (!session || isStoptimerSession(session)) return 0;
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  const planned = session.durationSec || POMO_DURATION_SEC;
  const elapsed = Math.floor((Date.now() - started) / 1000);
  return Math.max(0, planned - elapsed);
}

export function pomoElapsedSec(session) {
  if (!session) return 0;
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

export function locateRow(folders, r) {
  for (const folder of folders) {
    for (const mod of folder.mods) {
      if (mod[0] !== "Board" && mod[0] !== "Database") continue;
      const rows = mod[2]?.rows;
      if (!rows) continue;
      if (rows.includes(r)) return { folder, mod };
      if (r?.slug && rows.some((row) => row.slug === r.slug)) return { folder, mod };
    }
  }
  return null;
}

export function findCardBySlugs(folders, project, board, card) {
  const folder = folders.find((f) => f.slug === project);
  if (!folder) return null;
  const mod = folder.mods.find((m) => m[0] === "Board" && m[2]?.slug === board);
  if (!mod) return null;
  const row = (mod[2].rows || []).find((r) => r.slug === card);
  return row ? { row, folder, mod } : null;
}

/** Current card name from workspace; falls back when the card is gone. */
export function liveCardTitle(folders, project, board, card, fallback = "Untitled") {
  const hit = findCardBySlugs(folders, project, board, card);
  const name = hit?.row?.n;
  if (name != null && String(name).trim()) return String(name).trim();
  return fallback || "Untitled";
}

export function allBoardTasks(folders, PC_COLORS = PC) {
  const out = [];
  folders.forEach((folder, fi) => {
    if (folder.archived) return;
    folder.mods.forEach((mod) => {
      if (mod[0] === "Board" && mod[2]?.rows)
        mod[2].rows.forEach((row) => out.push({ row, folder, mod, fi }));
    });
  });
  return out;
}

export function allBoards(folders) {
  const out = [];
  folders.forEach((folder, fi) => {
    if (folder.archived) return;
    folder.mods.forEach((mod) => {
      if (mod[0] === "Board")
        out.push({
          folder,
          mod,
          fi,
          color: folder.color || PC[fi % PC.length],
          key: boardKey(folder, mod),
        });
    });
  });
  return out;
}

export function allModTabs(folders, modType) {
  const out = [];
  folders.forEach((folder, fi) => {
    if (folder.archived) return;
    folder.mods.forEach((mod) => {
      if (mod[0] !== modType) return;
      out.push({
        folder,
        mod,
        fi,
        color: folder.color || PC[fi % PC.length],
        key: `${folder.slug || ""}/${mod[2]?.slug || ""}`,
        label: `${folder.name} · ${mod[1]}`,
      });
    });
  });
  return out;
}

export function allNotesTabs(folders) {
  return allModTabs(folders, "Notes");
}

export function allFilesTabs(folders) {
  return allModTabs(folders, "Files");
}

export function taskKey(project, board, card) {
  return `${project || ""}/${board || ""}/${card || ""}`;
}

/** Timelog target from a board card (folder + mod + row). */
export function timelogTaskFromCard(folder, mod, row, fi = 0) {
  return {
    key: taskKey(folder.slug, mod[2]?.slug, row.slug),
    project: folder.slug,
    board: mod[2]?.slug || "",
    card: row.slug,
    title: row.n || "Untitled",
    projectName: folder.name || "",
    boardName: mod[1] || "",
    color: folder.color || PC[fi % PC.length] || GACC,
  };
}
