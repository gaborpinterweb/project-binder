/** Database → clipboard / file export helpers. */

import { saveExportFile } from "./api.js";
import { formatNumberValue, plainFromHtml } from "./dbFields.js";
import { downloadBlob, slugifyClient } from "./utils.js";

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Plain cell text suitable for CSV (matches on-screen meaning). */
export function formatDbCsvCell(col, raw) {
  if (!col) return "";
  if (col.type === "checkbox") {
    return raw === true || raw === "true" || raw === 1 ? "true" : "false";
  }
  if (col.type === "longtext") return plainFromHtml(raw);
  if (col.type === "multiselect") {
    const arr = Array.isArray(raw)
      ? raw
      : raw == null || raw === ""
        ? []
        : [String(raw)];
    return arr.map(String).join(", ");
  }
  if (col.type === "number") {
    return formatNumberValue(raw, col.decimal);
  }
  return raw == null ? "" : String(raw);
}

/** Build a CSV string for the given columns and rows. */
export function buildDbCsv(cols, rows) {
  const list = Array.isArray(cols) ? cols.filter(Boolean) : [];
  const header = list.map((c) => escapeCsvCell(c.label || c.id));
  const body = (Array.isArray(rows) ? rows : []).map((row) =>
    list.map((c) => escapeCsvCell(formatDbCsvCell(c, row?.[c.id])))
  );
  return [header, ...body].map((line) => line.join(",")).join("\n");
}

export function dbCsvFilename(baseName = "database") {
  const base = slugifyClient(baseName) || "database";
  return `${base}.csv`;
}

export async function copyDbCsvToClipboard(cols, rows) {
  const csv = buildDbCsv(cols, rows);
  await navigator.clipboard.writeText(csv);
  return csv;
}

async function saveViaFilePicker(filename, text) {
  if (typeof window.showSaveFilePicker !== "function") return null;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "CSV",
          accept: { "text/csv": [".csv"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { ok: true };
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, cancelled: true };
    return null;
  }
}

/**
 * Save CSV via native Save dialog when possible; otherwise trigger a download.
 * `beforePrompt` runs after CSV is built, before the file picker (e.g. clear a toast).
 * Returns `{ ok, cancelled? }`.
 */
export async function saveDbCsv(
  cols,
  rows,
  baseName = "database",
  { beforePrompt } = {}
) {
  const filename = dbCsvFilename(baseName);
  const text = "\uFEFF" + buildDbCsv(cols, rows);
  beforePrompt?.();

  const picked = await saveViaFilePicker(filename, text);
  if (picked) return picked;

  if (typeof window !== "undefined" && window.desktop) {
    return saveExportFile({
      title: "Save as CSV",
      filename,
      content: text,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
  }

  downloadBlob(
    filename,
    new Blob([text], { type: "text/csv;charset=utf-8" })
  );
  return { ok: true };
}
