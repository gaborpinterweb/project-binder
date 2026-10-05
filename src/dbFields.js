/** Database field type definitions and helpers. */

export const FIELD_TYPES = [
  { value: "text", label: "Text", icon: "fieldText" },
  { value: "longtext", label: "Rich text", icon: "fieldLongText" },
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
  if (type === "stage") {
    return { value: "stage", label: "Stage", icon: "fieldSelect" };
  }
  return FIELD_TYPES.find((t) => t.value === type) || FIELD_TYPES[0];
}

export function fieldTypeIcon(type) {
  return fieldTypeMeta(type).icon;
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

export function normalizeSelectOption(o, index = 0) {
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

export function normalizeDbCol(c) {
  if (!c || !c.id) return null;
  const type = TYPE_SET.has(c.type) || c.type === "stage" ? c.type : "text";
  const col = {
    id: c.id,
    label: c.label || c.id,
    type,
    required: !!c.required,
  };
  if (type === "number") col.decimal = !!c.decimal;
  if (type === "select" || type === "multiselect") {
    col.options = Array.isArray(c.options)
      ? c.options.map((o, i) => normalizeSelectOption(o, i)).filter(Boolean)
      : [];
  }
  return col;
}

export function serializeDbCol(c) {
  const col = normalizeDbCol(c);
  if (!col) return null;
  const out = { id: col.id, label: col.label, type: col.type };
  if (col.required) out.required = true;
  if (col.type === "number" && col.decimal) out.decimal = true;
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
  if (col.type === "stage") return stages[0] || "";
  if (col.id === "n") return "New entry";
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

export function formatNumberPreview(decimal) {
  return decimal ? "1,234.56" : "1,235";
}

export function formatNumberValue(value, decimal) {
  if (value === "" || value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return decimal
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      })
    : Math.round(n).toLocaleString();
}

/** Dropdown-ready options: `{ value, label, color }`. */
export function selectOptions(col, stages = []) {
  if (col?.type === "stage") {
    return stages.map((s) => ({
      value: s,
      label: s,
      color: "default",
    }));
  }
  return (Array.isArray(col?.options) ? col.options : [])
    .map((o, i) => normalizeSelectOption(o, i))
    .filter(Boolean)
    .map((o) => ({ value: o.label, label: o.label, color: o.color }));
}

export function findSelectOption(col, value, stages = []) {
  const opts = selectOptions(col, stages);
  return opts.find((o) => o.value === value) || null;
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
