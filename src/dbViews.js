/** Database custom view helpers. */

import { createFilterRule, createFilterState } from "./dbFilters.js";
import { createSortState, normalizeSorts } from "./dbSorts.js";

export const DEFAULT_VIEW_ID = "default";
export const DEFAULT_VIEW_NAME = "Default view";

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
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function createDefaultCustomView(filters, name = DEFAULT_VIEW_NAME, hiddenCols, sorts) {
  return {
    id: DEFAULT_VIEW_ID,
    name: String(name || DEFAULT_VIEW_NAME).trim() || DEFAULT_VIEW_NAME,
    filters: normalizeFilters(filters),
    hiddenCols: normalizeHiddenCols(hiddenCols),
    sorts: normalizeSorts(sorts ?? createSortState()),
  };
}

export function createCustomView(name = "Untitled view", filters, hiddenCols, sorts) {
  return {
    id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name || "Untitled view").trim() || "Untitled view",
    filters: normalizeFilters(filters ?? createFilterState()),
    hiddenCols: normalizeHiddenCols(hiddenCols),
    sorts: normalizeSorts(sorts ?? createSortState()),
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
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.id == null) continue;
    const id = String(v.id);
    if (id === DEFAULT_VIEW_ID) {
      defaultFilters = normalizeFilters(v.filters);
      defaultName = String(v.name || DEFAULT_VIEW_NAME).trim() || DEFAULT_VIEW_NAME;
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
  return [
    createDefaultCustomView(defaultFilters, defaultName, defaultHiddenCols, defaultSorts),
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

export function activeCustomView(views, viewId) {
  const list = normalizeCustomViews(views);
  const id = resolveCustomViewId(viewId, list);
  return list.find((v) => v.id === id) || list[0];
}
