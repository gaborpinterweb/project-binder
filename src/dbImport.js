/** Database CSV import: parse, type inference, value coerce, column plans. */

import {
  coerceFieldValue,
  emptyFieldValue,
  ensureNameColumn,
  FIELD_TYPES,
  nextSelectColor,
  serializeDbCol,
} from "./dbFields.js";

export const WHERE_NEW = "__new__";

const TYPE_VALUES = new Set(FIELD_TYPES.map((t) => t.value));

/** Strip UTF-8 BOM and parse RFC4180-ish CSV into headers + string rows. */
export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  if (!raw.trim()) return { headers: [], rows: [] };

  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < raw.length) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell);
      cell = "";
      if (ch === "\r" && raw[i + 1] === "\n") i += 1;
      i += 1;
      // Skip trailing empty line after final newline.
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    rows.push(row);
  }

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h, idx) => {
    const label = String(h ?? "").trim();
    return label || `Column ${idx + 1}`;
  });
  const data = rows.slice(1).map((r) => {
    const out = headers.map((_, idx) =>
      r[idx] == null ? "" : String(r[idx])
    );
    return out;
  });

  return { headers, rows: data };
}

function nonEmpty(values) {
  return (Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v !== "");
}

function looksLikeCheckbox(v) {
  const s = String(v).trim().toLowerCase();
  return (
    s === "true" ||
    s === "false" ||
    s === "1" ||
    s === "0" ||
    s === "yes" ||
    s === "no"
  );
}

function looksLikeNumber(v) {
  const s = String(v).trim().replace(/,/g, "");
  if (!s) return false;
  return Number.isFinite(Number(s));
}

function looksLikeDate(v) {
  const s = String(v).trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

function looksLikeUrl(v) {
  const s = String(v).trim();
  if (!s) return false;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return true;
  if (/^www\./i.test(s)) return true;
  return false;
}

/** Infer a FIELD_TYPES value from sample cell strings. */
export function inferColumnType(values) {
  const samples = nonEmpty(values);
  if (!samples.length) return "text";
  if (samples.every(looksLikeCheckbox)) return "checkbox";
  if (samples.every(looksLikeNumber)) return "number";
  if (samples.every(looksLikeDate)) return "date";
  if (samples.every(looksLikeUrl)) return "url";
  const unique = new Set(samples.map((s) => s.toLowerCase()));
  if (
    samples.length >= 4 &&
    unique.size >= 2 &&
    unique.size <= Math.min(12, Math.ceil(samples.length * 0.5))
  ) {
    return "select";
  }
  return "text";
}

/** Unique select options harvested from CSV cells (for select / multiselect). */
export function harvestSelectOptions(values, { multiselect = false } = {}) {
  const seen = new Set();
  const options = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const parts = multiselect
      ? String(raw ?? "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [String(raw ?? "").trim()].filter(Boolean);
    for (const label of parts) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ label, color: nextSelectColor(options) });
    }
  }
  return options;
}

export function coerceImportValue(col, raw) {
  if (!col) return raw ?? "";
  if (col.type === "checkbox") {
    const s = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (s === "" || s === "false" || s === "0" || s === "no") return false;
    if (s === "true" || s === "1" || s === "yes") return true;
    return coerceFieldValue(col, raw);
  }
  if (col.type === "multiselect") {
    if (raw == null || raw === "") return [];
    if (Array.isArray(raw)) return raw.map(String);
    return String(raw)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (col.type === "number") {
    if (raw == null || String(raw).trim() === "") return "";
    const n = Number(String(raw).trim().replace(/,/g, ""));
    return Number.isFinite(n) ? n : "";
  }
  if (col.type === "date") {
    const s = String(raw ?? "").trim();
    return s;
  }
  if (col.type === "longtext") {
    return raw == null ? "" : String(raw);
  }
  return coerceFieldValue(col, raw);
}

/** Default mappings: every CSV header → New column + inferred type. */
export function buildDefaultMappings(headers, rows) {
  const list = Array.isArray(headers) ? headers : [];
  return list.map((header, index) => {
    const values = (Array.isArray(rows) ? rows : []).map((r) => r?.[index]);
    const type = inferColumnType(values);
    return {
      header: String(header || `Column ${index + 1}`),
      index,
      where: WHERE_NEW,
      type: TYPE_VALUES.has(type) ? type : "text",
    };
  });
}

export function countNewColumns(mappings) {
  return (Array.isArray(mappings) ? mappings : []).filter(
    (m) => m && m.where === WHERE_NEW
  ).length;
}

/** Returns `{ ok, error? }` — blocks duplicate merge targets. */
export function validateImportMappings(mappings) {
  const list = Array.isArray(mappings) ? mappings : [];
  if (!list.length) {
    return { ok: false, error: "No columns to import." };
  }
  const merged = new Map();
  for (const m of list) {
    if (!m || m.where === WHERE_NEW) continue;
    const id = String(m.where);
    if (merged.has(id)) {
      return {
        ok: false,
        error: "Two CSV columns cannot merge into the same database column.",
      };
    }
    merged.set(id, true);
  }
  return { ok: true };
}

/**
 * Build final columns + per-row field objects from mappings.
 * Returns `{ columns, fieldRows }` where fieldRows[i] is `{ [colId]: value }`.
 */
export function buildImportPayload({
  mappings,
  rows,
  existingCols,
  stages = [],
}) {
  const cols = ensureNameColumn(existingCols);
  const byId = new Map(cols.map((c) => [c.id, c]));
  const nextCols = cols.map((c) => ({ ...c }));
  const colForMapping = [];

  for (const m of Array.isArray(mappings) ? mappings : []) {
    if (!m) continue;
    if (m.where === WHERE_NEW) {
      const type = TYPE_VALUES.has(m.type) ? m.type : "text";
      const values = (Array.isArray(rows) ? rows : []).map(
        (r) => r?.[m.index]
      );
      const draft = {
        id: "f" + Date.now() + "_" + m.index,
        label: m.header || `Column ${m.index + 1}`,
        type,
      };
      if (type === "select" || type === "multiselect") {
        draft.options = harvestSelectOptions(values, {
          multiselect: type === "multiselect",
        });
      }
      if (type === "number") draft.decimal = false;
      const saved = serializeDbCol(draft);
      if (saved) {
        nextCols.push(saved);
        colForMapping.push({ mapping: m, col: saved });
      }
    } else {
      const target = byId.get(m.where);
      if (!target) continue;
      colForMapping.push({ mapping: m, col: target });
    }
  }

  const finalCols = ensureNameColumn(nextCols).map(serializeDbCol).filter(Boolean);
  const fieldRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const fields = {};
    for (const c of finalCols) {
      fields[c.id] = emptyFieldValue(c, stages);
    }
    for (const { mapping, col } of colForMapping) {
      const raw = row?.[mapping.index];
      fields[col.id] = coerceImportValue(col, raw);
    }
    return fields;
  });

  return { columns: finalCols, fieldRows };
}
