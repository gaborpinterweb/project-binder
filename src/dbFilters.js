/** Database row filter helpers. */

import { plainFromHtml } from "./dbFields.js";

const TEXT_OPS = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const SELECT_OPS = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const MULTI_OPS = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const CHECKBOX_OPS = [
  { value: "is_checked", label: "is checked" },
  { value: "is_not_checked", label: "is not checked" },
];

const NUMBER_OPS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const DATE_OPS = [
  { value: "is", label: "is" },
  { value: "before", label: "is before" },
  { value: "after", label: "is after" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

export function createFilterRule() {
  return {
    id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fieldId: "",
    op: "",
    value: "",
  };
}

export function createFilterState() {
  return { junction: "and", rules: [createFilterRule()] };
}

export function operatorsForType(type) {
  if (type === "checkbox") return CHECKBOX_OPS;
  if (type === "number") return NUMBER_OPS;
  if (type === "date") return DATE_OPS;
  if (type === "multiselect") return MULTI_OPS;
  if (type === "select" || type === "stage") return SELECT_OPS;
  return TEXT_OPS;
}

export function opNeedsValue(op) {
  return !(
    op === "is_empty" ||
    op === "is_not_empty" ||
    op === "is_checked" ||
    op === "is_not_checked"
  );
}

export function isRuleActive(rule, cols) {
  if (!rule?.fieldId || !rule?.op) return false;
  const col = cols.find((c) => c.id === rule.fieldId);
  if (!col) return false;
  if (!opNeedsValue(rule.op)) return true;
  if (col.type === "checkbox") return true;
  if (Array.isArray(rule.value)) return rule.value.length > 0;
  return rule.value != null && String(rule.value).trim() !== "";
}

export function countActiveFilters(state, cols) {
  return (state?.rules || []).filter((r) => isRuleActive(r, cols)).length;
}

function cellText(col, raw) {
  if (col.type === "longtext") return plainFromHtml(raw);
  if (col.type === "checkbox") return raw === true || raw === "true" || raw === 1;
  if (col.type === "multiselect") {
    return Array.isArray(raw) ? raw.map(String) : raw == null || raw === "" ? [] : [String(raw)];
  }
  if (col.type === "number") {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return raw == null ? "" : String(raw);
}

function isEmptyCell(col, cell) {
  if (col.type === "checkbox") return !cell;
  if (col.type === "multiselect") return !cell.length;
  if (col.type === "number") return cell == null;
  return String(cell).trim() === "";
}

function matchRule(row, rule, cols) {
  const col = cols.find((c) => c.id === rule.fieldId);
  if (!col) return true;
  const cell = cellText(col, row[col.id]);
  const op = rule.op;
  const needle = rule.value;

  if (op === "is_empty") return isEmptyCell(col, cell);
  if (op === "is_not_empty") return !isEmptyCell(col, cell);
  if (op === "is_checked") return cell === true;
  if (op === "is_not_checked") return cell !== true;

  if (col.type === "number") {
    const n = Number(needle);
    if (!Number.isFinite(n) || cell == null) return false;
    if (op === "eq") return cell === n;
    if (op === "neq") return cell !== n;
    if (op === "gt") return cell > n;
    if (op === "lt") return cell < n;
    if (op === "gte") return cell >= n;
    if (op === "lte") return cell <= n;
    return true;
  }

  if (col.type === "multiselect") {
    const v = String(needle);
    if (op === "contains") return cell.includes(v);
    if (op === "not_contains") return !cell.includes(v);
    return true;
  }

  if (col.type === "date") {
    const a = String(cell);
    const b = String(needle);
    if (op === "is") return a === b;
    if (op === "before") return a && b && a < b;
    if (op === "after") return a && b && a > b;
    return true;
  }

  const hay = String(cell).toLowerCase();
  const n = String(needle).toLowerCase();
  if (op === "contains") return hay.includes(n);
  if (op === "not_contains") return !hay.includes(n);
  if (op === "is") return hay === n;
  if (op === "is_not") return hay !== n;
  return true;
}

export function filterRows(rows, state, cols) {
  const active = (state?.rules || []).filter((r) => isRuleActive(r, cols));
  if (!active.length) return rows;
  const junction = state.junction === "or" ? "or" : "and";
  return rows.filter((row) => {
    if (junction === "or") return active.some((r) => matchRule(row, r, cols));
    return active.every((r) => matchRule(row, r, cols));
  });
}
