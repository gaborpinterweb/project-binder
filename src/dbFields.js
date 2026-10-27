/** Database field type definitions and helpers. */

/** System primary column — always first; label/type locked. */
export const NAME_COL_ID = "n";

export const FIELD_TYPES = [
  { value: "text", label: "Text", icon: "fieldText" },
  { value: "longtext", label: "Rich text", icon: "fieldLongText" },
  { value: "url", label: "URL", icon: "fieldUrl" },
  { value: "select", label: "Single select", icon: "fieldSelect" },
  { value: "multiselect", label: "Multi select", icon: "fieldMultiSelect" },
  { value: "checkbox", label: "Checkbox", icon: "fieldCheckbox" },
  { value: "number", label: "Number", icon: "fieldNumber" },
  { value: "date", label: "Date", icon: "fieldDate" },
];

/** Select option colors — vibrant chips with readable ink. */
export const SELECT_COLORS = [
  { id: "default", label: "Default", bg: "#e3e2e0", fg: "#2c2a26" },
  { id: "gray", label: "Gray", bg: "#cfcbc4", fg: "#2c2a26" },
  { id: "brown", label: "Brown", bg: "#e0a888", fg: "#3a1f12" },
  { id: "orange", label: "Orange", bg: "#ff9f5a", fg: "#3a1a00" },
  { id: "yellow", label: "Yellow", bg: "#f5d045", fg: "#3a2e00" },
  { id: "green", label: "Green", bg: "#5dcc8b", fg: "#0c2e1a" },
  { id: "blue", label: "Blue", bg: "#5ba8e0", fg: "#0a2740" },
  { id: "purple", label: "Purple", bg: "#b57edc", fg: "#2a1040" },
  { id: "pink", label: "Pink", bg: "#f080ab", fg: "#3a1428" },
  { id: "red", label: "Red", bg: "#f07167", fg: "#3a1010" },
];

const SELECT_COLOR_IDS = new Set(SELECT_COLORS.map((c) => c.id));
const TYPE_SET = new Set(FIELD_TYPES.map((t) => t.value));

export function fieldTypeMeta(type) {
  return FIELD_TYPES.find((t) => t.value === type) || FIELD_TYPES[0];
}

export function fieldTypeIcon(type) {
  return fieldTypeMeta(type).icon;
}

/** Default name for a new column of the given type, e.g. "Text column". */
export function defaultColumnLabel(type) {
  return fieldTypeMeta(type).label + " column";
}

/** True when label is empty or still an auto-generated type default. */
export function isDefaultColumnLabel(label) {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) return true;
  return FIELD_TYPES.some((t) => defaultColumnLabel(t.value) === trimmed);
}

export function selectColor(colorId) {
  return (
    SELECT_COLORS.find((c) => c.id === colorId) ||
    SELECT_COLORS[0]
  );
}

export function nextSelectColor(options = []) {
  const used = Array.isArray(options) ? options.length : 0;
  const palette = SELECT_COLORS.filter((c) => c.id !== "default" && c.id !== "gray");
  return palette[used % palette.length].id;
}

function normalizeSelectOption(o, index = 0) {
  if (o == null) return null;
  const palette = SELECT_COLORS.filter((c) => c.id !== "default" && c.id !== "gray");
  const fallback = palette[index % palette.length].id;
  if (typeof o === "string") {
    const label = o.trim();
    if (!label) return null;
    return { label, color: fallback };
  }
  if (typeof o !== "object") return null;
  const label = String(o.label ?? o.value ?? "").trim();
  if (!label) return null;
  const color = SELECT_COLOR_IDS.has(o.color) ? o.color : fallback;
  return { label, color };
}

export function isNameCol(col) {
  return !!(col && col.id === NAME_COL_ID);
}

export function nameColumn() {
  return { id: NAME_COL_ID, label: "Name", type: "text" };
}

export function normalizeDbCol(c) {
  if (!c || !c.id) return null;
  if (c.id === NAME_COL_ID) return nameColumn();
  // Legacy "stage" (masterboard-linked) → plain select.
  let type = c.type === "stage" ? "select" : c.type;
  type = TYPE_SET.has(type) ? type : "text";
  const col = {
    id: c.id,
    label: c.label || c.id,
    type,
  };
  if (type === "select" || type === "multiselect") {
    col.options = Array.isArray(c.options)
      ? c.options.map((o, i) => normalizeSelectOption(o, i)).filter(Boolean)
      : [];
  }
  return col;
}

/** Ensure Name exists and is first; strips duplicate Name ids. */
export function ensureNameColumn(cols) {
  const rest = (Array.isArray(cols) ? cols : [])
    .map(normalizeDbCol)
    .filter((c) => c && c.id !== NAME_COL_ID);
  return [nameColumn(), ...rest];
}

export function serializeDbCol(c) {
  const col = normalizeDbCol(c);
  if (!col) return null;
  if (col.id === NAME_COL_ID) {
    return { id: NAME_COL_ID, label: "Name", type: "text" };
  }
  const out = { id: col.id, label: col.label, type: col.type };
  if (col.type === "select" || col.type === "multiselect") {
    out.options = (col.options || []).map((o) => ({
      label: o.label,
      color: o.color || "default",
    }));
  }
  return out;
}

export function emptyFieldValue(col, stages = []) {
  if (!col) return "";
  if (col.type === "checkbox") return false;
  if (col.type === "multiselect") return [];
  if (col.id === NAME_COL_ID) return "New record";
  return "";
}

export function coerceFieldValue(col, raw) {
  if (!col) return raw ?? "";
  if (col.type === "checkbox") return raw === true || raw === "true" || raw === 1;
  if (col.type === "multiselect") {
    if (Array.isArray(raw)) return raw.map(String);
    if (raw == null || raw === "") return [];
    return [String(raw)];
  }
  if (col.type === "number") {
    if (raw == null || raw === "") return "";
    const n = Number(raw);
    return Number.isFinite(n) ? n : "";
  }
  return raw == null ? "" : raw;
}

export function formatNumberValue(value) {
  if (value === "" || value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

/** Safe href for a URL field value (adds https:// when scheme is missing). */
export function hrefForUrlField(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(s)) return s;
  return "https://" + s;
}

/** Dropdown-ready options: `{ value, label, color }`. */
export function selectOptions(col, stages = []) {
  return (Array.isArray(col?.options) ? col.options : [])
    .map((o, i) => normalizeSelectOption(o, i))
    .filter(Boolean)
    .map((o) => ({ value: o.label, label: o.label, color: o.color }));
}

export function findSelectOption(col, value, stages = []) {
  const opts = selectOptions(col, stages);
  return opts.find((o) => o.value === value) || null;
}

/**
 * Append a select/multiselect option if the label is new.
 * @returns {{ col: object, created: boolean, label: string }}
 */
export function appendSelectOption(col, label) {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) return { col, created: false, label: "" };
  if (col?.type !== "select" && col?.type !== "multiselect") {
    return { col, created: false, label: trimmed };
  }
  const options = Array.isArray(col.options) ? col.options.slice() : [];
  const exists = options.some(
    (o) => String(o?.label ?? o ?? "").trim() === trimmed
  );
  if (exists) return { col, created: false, label: trimmed };
  options.push({ label: trimmed, color: nextSelectColor(options) });
  return { col: { ...col, options }, created: true, label: trimmed };
}

export function plainFromHtml(html) {
  if (html == null || html === "") return "";
  const s = String(html);
  if (!/<[a-z][\s\S]*>/i.test(s)) return s;
  if (typeof document === "undefined") {
    return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = s;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}
