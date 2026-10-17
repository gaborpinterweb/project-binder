/** Database preset (saved view) helpers. */

import { NAME_COL_ID } from "./dbFields.js";
import { createFilterRule, createFilterState } from "./dbFilters.js";
import { createSortState, normalizeSorts } from "./dbSorts.js";

export const DEFAULT_VIEW_ID = "default";
const DEFAULT_VIEW_NAME = "Default preset";

export const DEFAULT_COL_WIDTH = 180;
export const NAME_COL_WIDTH = 240;
export const CHECKBOX_COL_WIDTH = 64;
export const MIN_COL_WIDTH = 80;
export const MAX_COL_WIDTH = 720;

export function normalizeColWidths(colWidths) {
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

export function resolveColWidth(col, colWidths) {
  const id = col?.id != null ? String(col.id) : "";
  const stored = id ? normalizeColWidths(colWidths)[id] : undefined;
  if (stored != null) return stored;
  if (id === NAME_COL_ID) return NAME_COL_WIDTH;
  if (col?.type === "checkbox") return CHECKBOX_COL_WIDTH;
  return DEFAULT_COL_WIDTH;
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== "object") return createFilterState();
  const junction = filters.junction === "or" ? "or" : "and";
  const rules = Array.isArray(filters.rules)
    ? filters.rules
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          return {
            id: String(r.id || createFilterRule().id),
            fieldId: String(r.fieldId || ""),
            op: String(r.op || ""),
            value: r.value ?? "",
          };
        })
        .filter(Boolean)
    : [];
  return {
    junction,
    rules: rules.length ? rules : [createFilterRule()],
  };
}

export function normalizeHiddenCols(hiddenCols) {
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

function createDefaultCustomView(
  filters,
  name = DEFAULT_VIEW_NAME,
  hiddenCols,
  sorts,
  wrapLines,
  verticalBorders,
  colWidths
) {
  return {
    id: DEFAULT_VIEW_ID,
    name: String(name || DEFAULT_VIEW_NAME).trim() || DEFAULT_VIEW_NAME,
    filters: normalizeFilters(filters),
    hiddenCols: normalizeHiddenCols(hiddenCols),
    sorts: normalizeSorts(sorts ?? createSortState()),
    wrapLines: !!wrapLines,
    // Missing → on (legacy presets + new defaults).
    verticalBorders: verticalBorders !== false,
    colWidths: normalizeColWidths(colWidths),
  };
}

export function createCustomView(
  name = "Untitled preset",
  filters,
  hiddenCols,
  sorts,
  wrapLines,
  verticalBorders,
  colWidths
) {
  return {
    id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name || "Untitled preset").trim() || "Untitled preset",
    filters: normalizeFilters(filters ?? createFilterState()),
    hiddenCols: normalizeHiddenCols(hiddenCols),
    sorts: normalizeSorts(sorts ?? createSortState()),
    wrapLines: !!wrapLines,
    verticalBorders: verticalBorders !== false,
    colWidths: normalizeColWidths(colWidths),
  };
}

export function isDefaultCustomView(view) {
  return view?.id === DEFAULT_VIEW_ID;
}

export function normalizeCustomViews(views) {
  const extras = [];
  let defaultFilters = createFilterState();
  let defaultName = DEFAULT_VIEW_NAME;
  let defaultHiddenCols = [];
  let defaultSorts = createSortState();
  let defaultWrapLines = false;
  let defaultVerticalBorders = true;
  let defaultColWidths = {};
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.id == null) continue;
    const id = String(v.id);
    if (id === DEFAULT_VIEW_ID) {
      defaultFilters = normalizeFilters(v.filters);
      defaultName = String(v.name || DEFAULT_VIEW_NAME).trim() || DEFAULT_VIEW_NAME;
      defaultHiddenCols = normalizeHiddenCols(v.hiddenCols);
      defaultSorts = normalizeSorts(v.sorts);
      defaultWrapLines = !!v.wrapLines;
      defaultVerticalBorders = v.verticalBorders !== false;
      defaultColWidths = normalizeColWidths(v.colWidths);
      continue;
    }
    extras.push({
      id,
      name: String(v.name || "Untitled preset").trim() || "Untitled preset",
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
      defaultName,
      defaultHiddenCols,
      defaultSorts,
      defaultWrapLines,
      defaultVerticalBorders,
      defaultColWidths
    ),
    ...extras,
  ];
}

export function visibleDbCols(cols, hiddenCols) {
  const hidden = new Set(normalizeHiddenCols(hiddenCols));
  return (Array.isArray(cols) ? cols : []).filter((c) => c && !hidden.has(c.id));
}

export function resolveCustomViewId(viewId, views) {
  const list = normalizeCustomViews(views);
  if (viewId && list.some((v) => v.id === viewId)) return viewId;
  return DEFAULT_VIEW_ID;
}
