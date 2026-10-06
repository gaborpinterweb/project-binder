/** Database row sort helpers. */

import { plainFromHtml } from "./dbFields.js";

export const SORT_DIRS = [
  { value: "asc", label: "Up" },
  { value: "desc", label: "Down" },
];

export function createSortRule() {
  return {
    id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fieldId: "",
    dir: "asc",
  };
}

export function createSortState() {
  return { rules: [createSortRule()] };
}

export function normalizeSorts(sorts) {
  if (!sorts || typeof sorts !== "object") return createSortState();
  const rules = Array.isArray(sorts.rules)
    ? sorts.rules
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          return {
            id: String(r.id || createSortRule().id),
            fieldId: String(r.fieldId || ""),
            dir: r.dir === "desc" ? "desc" : "asc",
          };
        })
        .filter(Boolean)
    : [];
  return { rules: rules.length ? rules : [createSortRule()] };
}

export function isSortRuleActive(rule, cols) {
  if (!rule?.fieldId) return false;
  return (cols || []).some((c) => c && c.id === rule.fieldId);
}

export function countActiveSorts(state, cols) {
  return (state?.rules || []).filter((r) => isSortRuleActive(r, cols)).length;
}

function sortKey(col, raw) {
  if (!col) return { empty: true, v: "" };
  if (col.type === "checkbox") {
    const on = raw === true || raw === "true" || raw === 1;
    return { empty: false, v: on ? 1 : 0 };
  }
  if (col.type === "number") {
    if (raw == null || raw === "") return { empty: true, v: 0 };
    const n = Number(raw);
    return Number.isFinite(n) ? { empty: false, v: n } : { empty: true, v: 0 };
  }
  if (col.type === "multiselect") {
    const list = Array.isArray(raw)
      ? raw.map(String)
      : raw == null || raw === ""
        ? []
        : [String(raw)];
    return { empty: !list.length, v: list.join(", ").toLowerCase() };
  }
  if (col.type === "longtext") {
    const t = plainFromHtml(raw).trim();
    return { empty: !t, v: t.toLowerCase() };
  }
  if (col.type === "date") {
    const t = raw == null ? "" : String(raw);
    return { empty: !t, v: t };
  }
  const t = raw == null ? "" : String(raw).trim();
  return { empty: !t, v: t.toLowerCase() };
}

function compareKeys(a, b, dir) {
  if (a.empty && b.empty) return 0;
  if (a.empty) return 1;
  if (b.empty) return -1;
  let cmp = 0;
  if (typeof a.v === "number" && typeof b.v === "number") {
    cmp = a.v - b.v;
  } else {
    cmp = String(a.v).localeCompare(String(b.v), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return dir === "desc" ? -cmp : cmp;
}

export function sortRows(rows, state, cols) {
  const active = (state?.rules || []).filter((r) => isSortRuleActive(r, cols));
  if (!active.length) return rows;
  const list = Array.isArray(rows) ? rows.slice() : [];
  list.sort((ra, rb) => {
    for (const rule of active) {
      const col = cols.find((c) => c.id === rule.fieldId);
      const cmp = compareKeys(sortKey(col, ra[rule.fieldId]), sortKey(col, rb[rule.fieldId]), rule.dir);
      if (cmp) return cmp;
    }
    return 0;
  });
  return list;
}
