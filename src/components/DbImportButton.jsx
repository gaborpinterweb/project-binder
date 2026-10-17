import { useRef, useState } from "react";
import { fetchWorkspace, postItem, putDatabase } from "../api.js";
import {
  ensureNameColumn,
  serializeDbCol,
} from "../dbFields.js";
import {
  buildDefaultMappings,
  buildImportPayload,
  parseCsv,
  validateImportMappings,
} from "../dbImport.js";
import {
  normalizeCustomViews,
  resolveCustomViewId,
} from "../dbViews.js";
import { Icon } from "../icons.jsx";
import { showSnackbar } from "../snackbar.js";
import DbImportDialog from "./DbImportDialog.jsx";

async function persistColumns(folder, mod, columns) {
  await putDatabase({
    project: folder.id,
    database: mod[2].id,
    name: mod[1],
    columns: ensureNameColumn(columns).map(serializeDbCol).filter(Boolean),
    customViews: normalizeCustomViews(mod[2].customViews),
    customViewId: resolveCustomViewId(
      mod[2].customViewId,
      mod[2].customViews
    ),
  });
}

/** Database Import toolbar button (before Export). */
export default function DbImportButton({
  folder,
  mod,
  cols,
  stages = [],
  disabled,
  onApplyWorkspace,
}) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const openPicker = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.headers.length) {
        showSnackbar({
          icon: "alert",
          message: "Could not read CSV headers",
          durationMs: 3000,
        });
        return;
      }
      setDraft({
        headers: parsed.headers,
        rows: parsed.rows,
        mappings: buildDefaultMappings(parsed.headers, parsed.rows),
      });
    } catch {
      showSnackbar({
        icon: "alert",
        message: "Could not read CSV file",
        durationMs: 3000,
      });
    }
  };

  const close = () => {
    if (busy) return;
    setDraft(null);
  };

  const runImport = async (mappings) => {
    if (!draft || busy) return;
    const check = validateImportMappings(mappings);
    if (!check.ok) return;
    if (!draft.rows.length) return;

    setBusy(true);
    try {
      const { columns, fieldRows } = buildImportPayload({
        mappings,
        rows: draft.rows,
        existingCols: cols,
        stages,
      });

      await persistColumns(folder, mod, columns);

      for (const fields of fieldRows) {
        await postItem({
          project: folder.id,
          database: mod[2].id,
          fields,
        });
      }

      const data = await fetchWorkspace();
      onApplyWorkspace?.(data, {
        project: folder.id,
        board: mod[2].id,
      });

      setDraft(null);
      showSnackbar({
        icon: "check",
        message: `Imported ${fieldRows.length} ${
          fieldRows.length === 1 ? "record" : "records"
        }`,
        durationMs: 2500,
      });
    } catch {
      showSnackbar({
        icon: "alert",
        message: "Could not import CSV",
        durationMs: 3000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="db-import-input"
        tabIndex={-1}
        onChange={onFile}
      />
      <button
        type="button"
        className="mod-act"
        aria-label="Import"
        title="Import"
        disabled={disabled || busy}
        onClick={openPicker}
      >
        <Icon name="import" size={18} />
        <span className="mod-act-lab">Import</span>
      </button>
      {draft ? (
        <DbImportDialog
          rows={draft.rows}
          cols={cols}
          initialMappings={draft.mappings}
          busy={busy}
          onConfirm={runImport}
          onClose={close}
        />
      ) : null}
    </>
  );
}
