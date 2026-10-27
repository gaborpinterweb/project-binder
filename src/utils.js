import { askConfirm } from "./confirmDialog.js";
import {
  cardWeight,
  effortSortRank,
  impactSortRank,
  normalizeEffort,
} from "./cardMeta.js";
import { ensureNameColumn, normalizeDbCol } from "./dbFields.js";
import { normalizeCustomViews, resolveCustomViewId } from "./dbViews.js";
import { COVER_TAB_ID, newId, isSafePathId } from "./ids.js";
import { getPb, isPbMode } from "./pb/client.js";

export { COVER_TAB_ID, newId, isSafePathId };

export const STAGES = ["Backlog", "This week", "Today", "Tomorrow", "Next week"];
export const APP_NAME = "Project Binder";
/** Semver only — used for GitHub release update matching (`checkUpdate.js`). */
export const APP_VERSION = "0.1.0";
/** Short git SHA from Vite `define` at build/dev; not part of update comparison. */
export const APP_COMMIT = typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : "";

export const TYPES = [
  { t: "Board", title: "Tasks", sub: "Board with cards and columns" },
  { t: "Notes", title: "Notes", sub: "Rich text editor with list view and filters" },
  { t: "Files", title: "Files", sub: "Documents for quick reach and preview" },
  { t: "Database", title: "Records", sub: "Structured entries with database features" },
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
export const BOARD_SHOW_KEY = `${STORAGE_PREFIX}boardShow`;
export const BOARD_SORT_KEY = `${STORAGE_PREFIX}boardSort`;
const DB_VIEWS_SIDEBAR_KEY = `${STORAGE_PREFIX}dbViewsSidebar`;
const FILES_SORT_KEY = `${STORAGE_PREFIX}filesSort`;
const TIMELOG_VIEW_KEY = `${STORAGE_PREFIX}timelogView`;
const POMO_KEY = `${STORAGE_PREFIX}pomodoro`;
const COUNTDOWN_DURATION_KEY = `${STORAGE_PREFIX}countdownDurationMin`;
const STOPTIMER_MAX_KEY = `${STORAGE_PREFIX}stoptimerMaxMin`;
const UI_SOUNDS_KEY = `${STORAGE_PREFIX}uiSounds`;
const LAUNCH_SEEN_KEY = `${STORAGE_PREFIX}launchSeen`;
const NOTES_UNLOCKED_KEY = `${STORAGE_PREFIX}notesUnlocked`;
const NOTES_SELECTED_KEY = `${STORAGE_PREFIX}notesSelected`;
const DEFAULT_UI_SOUNDS = true;
export const WORKSPACE_ITEMS = ["Masterboard", "Timelogs", "Trash"];
export const DEFAULT_COUNTDOWN_DURATION_MIN = 25;
export const COUNTDOWN_DURATION_OPTIONS = [10, 15, 20, 25, 30, 45, 50, 60];
/** Minutes; `0` means no limit. */
export const DEFAULT_STOPTIMER_MAX_MIN = 240;
export const STOPTIMER_MAX_OPTIONS_MIN = [60, 120, 240, 480, 0];
export const POMO_DURATION_SEC = DEFAULT_COUNTDOWN_DURATION_MIN * 60;
/** Timelogs shorter than this are discarded on stop. */
export const MIN_TIMELOG_SEC = 60;
export const COMPLETED_VIEWS = ["hide", "virtual", "inplace"];
/** Per-board card sort; `project` is Masterboard-only. */
export const BOARD_SORTS = ["custom", "project", "impact", "effort", "weight"];
export const DEFAULT_BOARD_SORT = "custom";
export const GACC = "#3c3c40";

/** 16 cover colors: hue-spaced, no grays, each ≥4.5:1 with white text. */
export const PC = [
  "#e42737",
  "#d34317",
  "#be5a0e",
  "#a16b0e",
  "#857616",
  "#558321",
  "#278734",
  "#2a8563",
  "#198480",
  "#1a7eb0",
  "#3871e4",
  "#6957dd",
  "#9e52d4",
  "#c92cc4",
  "#d53485",
  "#df2c50",
];

const PC_NAMES = {
  "#e42737": "Cherry",
  "#d34317": "Coral",
  "#be5a0e": "Pumpkin",
  "#a16b0e": "Honey",
  "#857616": "Banana",
  "#558321": "Moss",
  "#278734": "Leaf",
  "#2a8563": "Mint",
  "#198480": "Sea",
  "#1a7eb0": "Teal",
  "#3871e4": "Sky",
  "#6957dd": "Ink",
  "#9e52d4": "Plum",
  "#c92cc4": "Grape",
  "#d53485": "Candy",
  "#df2c50": "Rose",
};

export function coverColorName(color) {
  return PC_NAMES[String(color || "").trim().toLowerCase()] || "Custom";
}

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
      boardMods.set(b.id, [
        "Board",
        b.name,
        {
          id: b.id,
          ...(b.shareId ? { shareId: b.shareId } : {}),
          ...(b.shareEnabled ? { shareEnabled: true } : {}),
          columns: b.columns && b.columns.length ? b.columns : undefined,
          rows: (b.cards || []).map((c) => {
            const msRaw = c.master || c.status;
            const row = {
              n: c.title,
              s: c.status,
              ms: msRaw,
              id: c.id,
              doneAt: c.doneAt || "",
              body: c.body || "",
            };
            if (c.ord != null && c.ord !== "" && !Number.isNaN(Number(c.ord))) {
              row.ord = Number(c.ord);
            }
            // Legacy boolean priority → Impact High; difficulty → effort
            const impact = c.impact || (c.priority ? "High" : "");
            if (impact) row.impact = impact;
            const effort = normalizeEffort(c.effort || c.difficulty);
            if (effort) row.effort = effort;
            if (Array.isArray(c.files) && c.files.length) {
              row.files = c.files.map((f) => ({
                id: f.id,
                name: f.name || f.id,
                mime: f.mime || "application/octet-stream",
                size: Number(f.size) || 0,
                createdAt: f.createdAt || "",
              }));
            }
            if (Array.isArray(c.images) && c.images.length) {
              row.images = c.images.map((f) => ({
                id: f.id,
                name: f.name || f.id,
                mime: f.mime || "application/octet-stream",
                size: Number(f.size) || 0,
                createdAt: f.createdAt || "",
              }));
            }
            return row;
          }),
        },
      ]);
    });
    const notesMods = new Map();
    (pr.notesTabs || []).forEach((nt) => {
      notesMods.set(nt.id, [
        "Notes",
        nt.name,
        {
          id: nt.id,
          ...(nt.shareId ? { shareId: nt.shareId } : {}),
          ...(nt.shareEnabled ? { shareEnabled: true } : {}),
          notes: (nt.notes || []).map((n) => {
            const note = {
              id: n.id,
              title: n.title || n.id,
              body: n.body || "",
              createdAt: n.createdAt || n.updatedAt || "",
              updatedAt: n.updatedAt || "",
            };
            if (n.pinned) note.pinned = true;
            if (Array.isArray(n.images) && n.images.length) {
              note.images = n.images.map((f) => ({
                id: f.id,
                name: f.name || f.id,
                mime: f.mime || "application/octet-stream",
                size: Number(f.size) || 0,
                createdAt: f.createdAt || "",
              }));
            }
            return note;
          }),
        },
      ]);
    });
    const filesMods = new Map();
    (pr.filesTabs || []).forEach((ft) => {
      filesMods.set(ft.id, [
        "Files",
        ft.name,
        {
          id: ft.id,
          ...(ft.shareId ? { shareId: ft.shareId } : {}),
          ...(ft.shareEnabled ? { shareEnabled: true } : {}),
          files: (ft.files || []).map((f) => ({
            id: f.id,
            name: f.name || f.id,
            mime: f.mime || "application/octet-stream",
            size: Number(f.size) || 0,
            createdAt: f.createdAt || "",
          })),
        },
      ]);
    });
    const dbMods = new Map();
    (pr.databases || []).forEach((db) => {
      dbMods.set(db.id, [
        "Database",
        db.name,
        {
          id: db.id,
          ...(db.shareId ? { shareId: db.shareId } : {}),
          ...(db.shareEnabled ? { shareEnabled: true } : {}),
          cols: ensureNameColumn(
            (db.columns || []).map(normalizeDbCol).filter(Boolean),
          ),
          rows: (db.items || []).map((item) => ({
            id: item.id,
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

    const pick = (type, id) => {
      if (type === "board") return boardMods.get(id);
      if (type === "notes") return notesMods.get(id);
      if (type === "files") return filesMods.get(id);
      if (type === "database") return dbMods.get(id);
      return null;
    };

    const mods = [
      [
        "Cover",
        "Cover",
        {
          id: COVER_TAB_ID,
          values: { description: (cover.values && cover.values.description) || "" },
          ...(Array.isArray(cover.images) && cover.images.length
            ? {
                images: cover.images.map((f) => ({
                  id: f.id,
                  name: f.name || f.id,
                  mime: f.mime || "application/octet-stream",
                  size: Number(f.size) || 0,
                  createdAt: f.createdAt || "",
                })),
              }
            : {}),
        },
      ],
    ];
    const seen = new Set();
    const pushMod = (mod) => {
      if (!mod) return;
      const key = `${mod[0]}:${mod[2]?.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      mods.push(mod);
    };

    for (const entry of pr.tabOrder || []) {
      pushMod(pick(entry.type, entry.id));
    }
    for (const mod of boardMods.values()) pushMod(mod);
    for (const mod of notesMods.values()) pushMod(mod);
    for (const mod of filesMods.values()) pushMod(mod);
    for (const mod of dbMods.values()) pushMod(mod);

    return {
      id: pr.id,
      name: pr.name,
      color: pr.color || GACC,
      archived: !!pr.archived,
      isDemo: !!pr.isDemo,
      ...(pr.shareId ? { shareId: pr.shareId } : {}),
      ...(pr.shareEnabled ? { shareEnabled: true } : {}),
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
      const id = mod?.[2]?.id;
      if (!type || !id) return null;
      return { type, id };
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
  return folder.id + "/" + (mod[2]?.id || mod[1]);
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

/** Trigger a browser file download from a Blob. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    // Plain-text bodies have no element children — fall back to body text.
    const text = (first?.textContent || doc.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
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

/** Rewrite embedded card RTE image URLs after a card moves board/project/id. */
export function rewriteCardRteImageUrls(
  html,
  { fromProject, fromBoard, fromCard, toProject, toBoard, toCard }
) {
  if (!html) return html || "";
  return String(html).replace(/\/api\/rte-image\?([^"'>\s]+)/g, (full, qs) => {
    let params;
    try {
      params = new URLSearchParams(qs);
    } catch {
      return full;
    }
    if (params.get("scope") !== "card") return full;
    if (params.get("project") !== fromProject) return full;
    if (params.get("board") !== fromBoard) return full;
    if (params.get("card") !== fromCard) return full;
    params.set("project", toProject);
    params.set("board", toBoard);
    params.set("card", toCard);
    return `/api/rte-image?${params.toString()}`;
  });
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

/**
 * Display order for open cards. Custom keeps `ord`; other modes sort in memory
 * without rewriting persisted order. `projectIndex(row)` required for `project`.
 */
export function sortBoardRows(rows, sortMode, { projectIndex } = {}) {
  const base = byOrd(rows);
  const mode = normalizeBoardSort(sortMode, { allowProject: true });
  if (mode === "custom") return base;
  return base
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      let cmp = 0;
      if (mode === "impact") {
        cmp = impactSortRank(b.r.impact) - impactSortRank(a.r.impact);
      } else if (mode === "effort") {
        cmp = effortSortRank(b.r.effort) - effortSortRank(a.r.effort);
      } else if (mode === "weight") {
        cmp = cardWeight(b.r) - cardWeight(a.r);
      } else if (mode === "project" && typeof projectIndex === "function") {
        cmp = (projectIndex(a.r) ?? 0) - (projectIndex(b.r) ?? 0);
      }
      return cmp || a.i - b.i;
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

/** Display duration as "4h 23m" / "23m". */
export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return h + "h " + m + "m";
  return m + "m";
}

export function formatSpent(sec) {
  return formatDuration(sec);
}

/** Live countdown/stopwatch — mm:ss (or h:mm:ss). */
export function formatTimer(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  if (h) return h + ":" + mm + ":" + ss;
  return mm + ":" + ss;
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
export const DEFAULT_TIMELOG_GROUP_BY = "Day";
export const TIMELOG_SORTS = ["Newest first", "Oldest first"];
export const DEFAULT_TIMELOG_SORT = "Newest first";

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

function timelogStamp(entry) {
  return String(entry?.endedAt || entry?.startedAt || "");
}

/** Compare by ended/started time; dir is 1 (oldest first) or -1 (newest first). */
export function compareTimelogStamp(a, b, dir = -1) {
  return dir * timelogStamp(a).localeCompare(timelogStamp(b));
}

/** Group by period (None/Day/Week/Month); sort periods and rows by sort. */
export function groupTimelogsByPeriodAndProject(
  entries,
  groupBy = "Day",
  sort = DEFAULT_TIMELOG_SORT
) {
  const mode = TIMELOG_GROUP_BYS.includes(groupBy) ? groupBy : "Day";
  const newestFirst = sort !== "Oldest first";
  const dir = newestFirst ? -1 : 1;
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
    .sort((a, b) => dir * String(a.key).localeCompare(String(b.key)))
    .map((period) => ({
      key: period.key,
      label: period.label,
      totalSec: period.totalSec,
      entries: period.entries
        .slice()
        .sort((a, b) => compareTimelogStamp(a, b, dir)),
    }));
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
export const DEFAULT_TIMELOG_PERIOD = "This week";

export function loadTimelogView() {
  const stored = readStorageJson(TIMELOG_VIEW_KEY, null);
  const period =
    stored && TIMELOG_PERIODS.includes(stored.period)
      ? stored.period
      : DEFAULT_TIMELOG_PERIOD;
  const groupBy =
    stored && TIMELOG_GROUP_BYS.includes(stored.groupBy)
      ? stored.groupBy
      : DEFAULT_TIMELOG_GROUP_BY;
  const sort =
    stored && TIMELOG_SORTS.includes(stored.sort)
      ? stored.sort
      : DEFAULT_TIMELOG_SORT;
  const boardOff = Array.isArray(stored?.boardOff)
    ? stored.boardOff.filter((k) => typeof k === "string" && k)
    : [];
  return { period, groupBy, sort, boardOff };
}

export function saveTimelogView(view) {
  const period = TIMELOG_PERIODS.includes(view?.period)
    ? view.period
    : DEFAULT_TIMELOG_PERIOD;
  const groupBy = TIMELOG_GROUP_BYS.includes(view?.groupBy)
    ? view.groupBy
    : DEFAULT_TIMELOG_GROUP_BY;
  const sort = TIMELOG_SORTS.includes(view?.sort)
    ? view.sort
    : DEFAULT_TIMELOG_SORT;
  const boardOff = Array.isArray(view?.boardOff)
    ? [...new Set(view.boardOff.filter((k) => typeof k === "string" && k))]
    : [];
  const next = { period, groupBy, sort, boardOff };
  writeStorageJson(TIMELOG_VIEW_KEY, next);
  return next;
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

export function loadCountdownDurationMin() {
  try {
    const n = Number(localStorage.getItem(COUNTDOWN_DURATION_KEY));
    if (COUNTDOWN_DURATION_OPTIONS.includes(n)) return n;
  } catch {}
  return DEFAULT_COUNTDOWN_DURATION_MIN;
}

export function saveCountdownDurationMin(value) {
  const n = Number(value);
  const next = COUNTDOWN_DURATION_OPTIONS.includes(n)
    ? n
    : DEFAULT_COUNTDOWN_DURATION_MIN;
  try {
    localStorage.setItem(COUNTDOWN_DURATION_KEY, String(next));
  } catch {}
  return next;
}

export function loadStoptimerMaxMin() {
  try {
    const n = Number(localStorage.getItem(STOPTIMER_MAX_KEY));
    if (STOPTIMER_MAX_OPTIONS_MIN.includes(n)) return n;
  } catch {}
  return DEFAULT_STOPTIMER_MAX_MIN;
}

export function saveStoptimerMaxMin(value) {
  const n = Number(value);
  const next = STOPTIMER_MAX_OPTIONS_MIN.includes(n)
    ? n
    : DEFAULT_STOPTIMER_MAX_MIN;
  try {
    localStorage.setItem(STOPTIMER_MAX_KEY, String(next));
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

/** Key in users.history for finishing the welcome / launch dialog. */
export const HISTORY_ONBOARDING_DIALOG_FINISHED = "onboarding_dialog_finished";

function launchSeenStorageKey(userId) {
  const id = userId != null ? String(userId).trim() : "";
  return id ? `${LAUNCH_SEEN_KEY}:${id}` : LAUNCH_SEEN_KEY;
}

function readLocalLaunchSeen(userId) {
  try {
    return localStorage.getItem(launchSeenStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeLocalLaunchSeen(userId, marked) {
  try {
    const key = launchSeenStorageKey(userId);
    if (marked) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {}
}

function currentAuthUserId() {
  if (!isPbMode()) return "";
  return getPb().authStore.record?.id || "";
}

/** Normalize users.history JSON to a plain object of string timestamps. */
export function normalizeUserHistory(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k || v == null || v === false) continue;
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = new Date(v).toISOString();
    } else if (v === true) {
      out[k] = new Date(0).toISOString();
    }
  }
  return out;
}

function readAuthHistory() {
  return normalizeUserHistory(getPb().authStore.record?.history);
}

async function writeAuthHistory(next) {
  const pb = getPb();
  const userId = pb.authStore.record?.id;
  if (!userId) return;
  const history = normalizeUserHistory(next);
  const record = await pb.collection("users").update(userId, { history });
  pb.authStore.save(pb.authStore.token, {
    ...pb.authStore.record,
    ...record,
    history,
  });
}

/** True when this account (or legacy local flag) has a timestamp for `key`. */
export function hasUserHistory(key) {
  const k = String(key || "").trim();
  if (!k) return false;
  if (isPbMode()) {
    if (readAuthHistory()[k]) return true;
    if (k === HISTORY_ONBOARDING_DIALOG_FINISHED) {
      return readLocalLaunchSeen(currentAuthUserId());
    }
    return false;
  }
  if (k === HISTORY_ONBOARDING_DIALOG_FINISHED) return readLocalLaunchSeen("");
  return false;
}

/** Record `key` on users.history with an ISO timestamp. */
export async function markUserHistory(key) {
  const k = String(key || "").trim();
  if (!k) return;
  const userId = currentAuthUserId();
  if (k === HISTORY_ONBOARDING_DIALOG_FINISHED) writeLocalLaunchSeen(userId, true);
  if (!isPbMode() || !userId) return;
  try {
    const at = new Date().toISOString();
    await writeAuthHistory({ ...readAuthHistory(), [k]: at });
  } catch {}
}

/** Remove `key` from users.history (e.g. dev reset). */
export async function clearUserHistory(key) {
  const k = String(key || "").trim();
  if (!k) return;
  const userId = currentAuthUserId();
  if (k === HISTORY_ONBOARDING_DIALOG_FINISHED) {
    writeLocalLaunchSeen(userId, false);
    writeLocalLaunchSeen("", false);
  }
  if (!isPbMode() || !userId) return;
  try {
    const next = { ...readAuthHistory() };
    delete next[k];
    await writeAuthHistory(next);
  } catch {}
}

/**
 * Promote a pre-migration device-local onboarding dismissal onto users.history
 * so other devices stop showing the dialog.
 */
export async function syncUserHistoryFromLocal(
  key = HISTORY_ONBOARDING_DIALOG_FINISHED
) {
  if (!isPbMode()) return;
  const k = String(key || "").trim();
  if (k !== HISTORY_ONBOARDING_DIALOG_FINISHED) return;
  const record = getPb().authStore.record;
  if (!record?.id || readAuthHistory()[k]) return;
  if (!readLocalLaunchSeen(record.id)) return;
  await markUserHistory(k);
}

export function hasSeenLaunch() {
  return hasUserHistory(HISTORY_ONBOARDING_DIALOG_FINISHED);
}

export async function markLaunchSeen() {
  return markUserHistory(HISTORY_ONBOARDING_DIALOG_FINISHED);
}

export async function clearLaunchSeen() {
  return clearUserHistory(HISTORY_ONBOARDING_DIALOG_FINISHED);
}

export async function syncLaunchSeenFromLocal() {
  return syncUserHistoryFromLocal(HISTORY_ONBOARDING_DIALOG_FINISHED);
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

/** Next default project color: least hue-crowded PC slot (circular), so neighbors stay free. */
export function nextUnusedProjectColor(folders) {
  const n = PC.length;
  const counts = Array(n).fill(0);
  for (const folder of folders || []) {
    const color = String(folder?.color || "").trim().toLowerCase();
    if (!color) continue;
    const idx = PC.findIndex((c) => c.toLowerCase() === color);
    if (idx >= 0) counts[idx] += 1;
  }

  const crowding = (i) => {
    let score = 0;
    for (let j = 0; j < n; j++) {
      if (!counts[j]) continue;
      const d = Math.abs(i - j);
      // Nearer used hues weigh more; opposite side of the wheel is cheapest.
      score += counts[j] / (1 + Math.min(d, n - d));
    }
    return score;
  };

  let best = 0;
  let bestScore = crowding(0);
  for (let i = 1; i < n; i++) {
    const score = crowding(i);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return PC[best];
}

export function loadLastTabs() {
  const stored = readStorageJson(LAST_TAB_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveLastTab(id, tabId) {
  if (!id || !tabId) return;
  const map = loadLastTabs();
  map[id] = tabId;
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

/** Map of unlock keys → true for notes currently unlocked for editing. */
export function loadNotesUnlocked() {
  const stored = readStorageJson(NOTES_UNLOCKED_KEY, {});
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored
    : {};
}

export function saveNotesUnlocked(map) {
  writeStorageJson(
    NOTES_UNLOCKED_KEY,
    map && typeof map === "object" && !Array.isArray(map) ? map : {}
  );
}

export function notesTabKey(projectId, notesTabId) {
  if (!projectId || !notesTabId) return "";
  return `${projectId}/${notesTabId}`;
}

export function noteUnlockKey(projectId, notesTabId, noteId) {
  if (!noteId) return "";
  const tab = notesTabKey(projectId, notesTabId);
  return tab ? `${tab}/${noteId}` : "";
}

/** Map of notes-tab keys → last viewed note id. */
export function loadNotesSelected() {
  const stored = readStorageJson(NOTES_SELECTED_KEY, {});
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored
    : {};
}

export function saveNotesSelected(tabKey, noteId) {
  if (!tabKey) return;
  const map = loadNotesSelected();
  if (noteId) map[tabKey] = String(noteId);
  else delete map[tabKey];
  writeStorageJson(NOTES_SELECTED_KEY, map);
}

/** Card preview meta chips (Details master + per-chip toggles). */
export function defaultBoardShow(scope) {
  return {
    details: true,
    taskBoard: scope === "master",
    priority: true,
    timeSpent: true,
    files: true,
  };
}

export function loadBoardShow() {
  const stored = readStorageJson(BOARD_SHOW_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function normalizeBoardShow(scope, raw) {
  const defaults = defaultBoardShow(scope);
  if (!raw || typeof raw !== "object") return defaults;
  const taskBoard =
    typeof raw.taskBoard === "boolean"
      ? raw.taskBoard
      : typeof raw.projectName === "boolean"
        ? raw.projectName
        : defaults.taskBoard;
  return {
    details: typeof raw.details === "boolean" ? raw.details : defaults.details,
    taskBoard,
    priority:
      typeof raw.priority === "boolean" ? raw.priority : defaults.priority,
    timeSpent:
      typeof raw.timeSpent === "boolean" ? raw.timeSpent : defaults.timeSpent,
    files: typeof raw.files === "boolean" ? raw.files : defaults.files,
  };
}

export function getBoardShow(scope, boardShowByScope) {
  if (boardShowByScope?.has(scope)) {
    return normalizeBoardShow(scope, boardShowByScope.get(scope));
  }
  const next = normalizeBoardShow(scope, loadBoardShow()[scope]);
  boardShowByScope?.set(scope, next);
  return next;
}

export function normalizeBoardSort(raw, { allowProject = false } = {}) {
  // Legacy sort key from Difficulty era
  if (raw === "difficulty") raw = "effort";
  if (raw === "project" && !allowProject) return DEFAULT_BOARD_SORT;
  return BOARD_SORTS.includes(raw) ? raw : DEFAULT_BOARD_SORT;
}

export function loadBoardSorts() {
  const stored = readStorageJson(BOARD_SORT_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function getBoardSort(scope, boardSortByScope, { allowProject = false } = {}) {
  if (boardSortByScope?.has(scope)) {
    return normalizeBoardSort(boardSortByScope.get(scope), { allowProject });
  }
  const next = normalizeBoardSort(loadBoardSorts()[scope], { allowProject });
  boardSortByScope?.set(scope, next);
  return next;
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
    project: folders[p]?.id || null,
  });
}

export function restoreTabIndex(pr) {
  if (!pr?.mods?.length) return 0;
  const want = loadLastTabs()[pr.id];
  if (!want) return 0;
  const i = pr.mods.findIndex((mod) => mod?.[2]?.id === want);
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

/** Cap in seconds, or `null` when unlimited. */
export function stoptimerMaxSec(maxMin = loadStoptimerMaxMin()) {
  const n = Number(maxMin);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n * 60);
}

export function isStoptimerAtMax(session, maxMin = loadStoptimerMaxMin()) {
  if (!isStoptimerSession(session)) return false;
  const maxSec = stoptimerMaxSec(maxMin);
  if (maxSec == null) return false;
  return pomoElapsedSec(session) >= maxSec;
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
      if (r?.id && rows.some((row) => row.id === r.id)) return { folder, mod };
    }
  }
  return null;
}

export function findCardByIds(folders, project, board, card) {
  const folder = folders.find((f) => f.id === project);
  if (!folder) return null;
  const mod = folder.mods.find((m) => m[0] === "Board" && m[2]?.id === board);
  if (!mod) return null;
  const row = (mod[2].rows || []).find((r) => r.id === card);
  return row ? { row, folder, mod } : null;
}

export function findDbItemByIds(folders, project, database, itemId) {
  const folder = folders.find((f) => f.id === project);
  if (!folder) return null;
  const mod = folder.mods.find(
    (m) => m[0] === "Database" && m[2]?.id === database
  );
  if (!mod) return null;
  const row = (mod[2].rows || []).find((r) => r.id === itemId);
  return row ? { row, folder, mod } : null;
}

/** Current card name from workspace; falls back when the card is gone. */
export function liveCardTitle(folders, project, board, card, fallback = "Untitled") {
  const hit = findCardByIds(folders, project, board, card);
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
        key: `${folder.id || ""}/${mod[2]?.id || ""}`,
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
    key: taskKey(folder.id, mod[2]?.id, row.id),
    project: folder.id,
    board: mod[2]?.id || "",
    card: row.id,
    title: row.n || "Untitled",
    projectName: folder.name || "",
    boardName: mod[1] || "",
    color: folder.color || PC[fi % PC.length] || GACC,
  };
}
