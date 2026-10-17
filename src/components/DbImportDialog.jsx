import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FIELD_TYPES,
  ensureNameColumn,
  fieldTypeMeta,
} from "../dbFields.js";
import {
  WHERE_NEW,
  countNewColumns,
  validateImportMappings,
} from "../dbImport.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";

function whereOptions(cols) {
  const list = ensureNameColumn(cols);
  return [
    { value: WHERE_NEW, label: "New column" },
    ...list.map((c) => ({
      value: c.id,
      label: `Merge into ${c.label || c.id}`,
    })),
  ];
}

function typeLabel(type) {
  return fieldTypeMeta(type).label;
}

export default function DbImportDialog({
  rows = [],
  cols = [],
  initialMappings = [],
  busy = false,
  onConfirm,
  onClose,
}) {
  const [mappings, setMappings] = useState(() =>
    initialMappings.length
      ? initialMappings.map((m) => ({ ...m }))
      : []
  );
  const confirmRef = useRef(null);
  const whereOpts = useMemo(() => whereOptions(cols), [cols]);
  const colsById = useMemo(() => {
    const map = new Map();
    ensureNameColumn(cols).forEach((c) => map.set(c.id, c));
    return map;
  }, [cols]);

  useEffect(() => {
    const t = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const recordCount = Array.isArray(rows) ? rows.length : 0;
  const newColCount = countNewColumns(mappings);
  const validation = validateImportMappings(mappings);
  const canImport =
    !busy &&
    recordCount > 0 &&
    mappings.length > 0 &&
    validation.ok;

  const patchMapping = (index, partial) => {
    setMappings((list) =>
      list.map((m, i) => (i === index ? { ...m, ...partial } : m))
    );
  };

  const submit = () => {
    if (!canImport) return;
    onConfirm?.(mappings);
  };

  return createPortal(
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        className="dlg prompt-dlg db-import-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-import-title"
      >
        <div className="dlg-content prompt-body">
          <h2 id="db-import-title" className="prompt-title">
            Import CSV
          </h2>
          <p className="prompt-msg prompt-msg-pre">
            {recordCount} {recordCount === 1 ? "record" : "records"} will be
            added
            {"\n"}
            {newColCount} {newColCount === 1 ? "column" : "columns"} will be
            added
          </p>
          {!validation.ok && validation.error ? (
            <p className="db-import-error" role="alert">
              {validation.error}
            </p>
          ) : null}
          {recordCount === 0 ? (
            <p className="db-import-error" role="alert">
              No data rows found in this CSV.
            </p>
          ) : null}

          <div className="db-import-map" role="list">
            <div className="db-import-map-head" aria-hidden="true">
              <span>CSV column</span>
              <span>Where</span>
              <span>New column type</span>
            </div>
            {mappings.map((m) => {
              const isNew = m.where === WHERE_NEW;
              const mergeCol = !isNew ? colsById.get(m.where) : null;
              const typeValue = isNew
                ? FIELD_TYPES.some((t) => t.value === m.type)
                  ? m.type
                  : "text"
                : mergeCol?.type === "stage"
                  ? "select"
                  : FIELD_TYPES.some((t) => t.value === mergeCol?.type)
                    ? mergeCol.type
                    : "text";
              return (
                <div
                  key={m.index}
                  className="db-import-map-row"
                  role="listitem"
                >
                  <div className="db-import-map-name" title={m.header}>
                    {m.header}
                  </div>
                  <Dropdown
                    className="db-import-where-dd"
                    ariaLabel={`Where for ${m.header}`}
                    value={m.where}
                    options={whereOpts}
                    disabled={busy}
                    onChange={(val) => patchMapping(m.index, { where: val })}
                  >
                    {whereOpts.find((o) => o.value === m.where)?.label ||
                      "New column"}
                  </Dropdown>
                  <Dropdown
                    className="db-import-type-dd"
                    ariaLabel={`New column type for ${m.header}`}
                    value={typeValue}
                    options={FIELD_TYPES}
                    disabled={busy || !isNew}
                    onChange={(val) => patchMapping(m.index, { type: val })}
                  >
                    <span className="dd-opt">
                      <Icon name={fieldTypeMeta(typeValue).icon} size={14} />
                      {typeLabel(typeValue)}
                    </span>
                  </Dropdown>
                </div>
              );
            })}
          </div>

          <div className="actions prompt-actions">
            <button
              type="button"
              className="dlg-delete"
              disabled={busy}
              onClick={() => onClose?.()}
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              className="dlg-create dlg-create-icon"
              disabled={!canImport}
              onClick={submit}
            >
              <Icon name="import" size={16} />
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
