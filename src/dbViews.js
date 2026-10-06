/** Database custom view helpers. */

import { createFilterRule, createFilterState } from "./dbFilters.js";

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

export function createDefaultCustomView(filters) {
  return {
    id: DEFAULT_VIEW_ID,
    name: DEFAULT_VIEW_NAME,
    filters: normalizeFilters(filters),
  };
}

export function createCustomView(name = "Untitled view", filters) {
  return {
    id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name || "Untitled view").trim() || "Untitled view",
    filters: normalizeFilters(filters ?? createFilterState()),
  };
}

export function isDefaultCustomView(view) {
  return view?.id === DEFAULT_VIEW_ID;
}

export function normalizeCustomViews(views) {
  const extras = [];
  let defaultFilters = createFilterState();
  for (const v of Array.isArray(views) ? views : []) {
    if (!v || v.id == null) continue;
    const id = String(v.id);
    if (id === DEFAULT_VIEW_ID) {
      defaultFilters = normalizeFilters(v.filters);
      continue;
    }
    extras.push({
      id,
      name: String(v.name || "Untitled view").trim() || "Untitled view",
      filters: normalizeFilters(v.filters),
    });
  }
  return [createDefaultCustomView(defaultFilters), ...extras];
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
