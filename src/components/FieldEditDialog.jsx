import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons.jsx";
import {
  FIELD_TYPES,
  SELECT_COLORS,
  fieldTypeMeta,
  formatNumberPreview,
  nextSelectColor,
  normalizeDbCol,
  selectColor,
  serializeDbCol,
} from "../dbFields.js";
import Dropdown from "./Dropdown.jsx";
import { askConfirm } from "../confirmDialog.js";

function blankCol() {
  return {
    id: "",
    label: "",
    type: "text",
    required: false,
    decimal: false,
    options: [],
  };
}

function OptionColorPicker({ color, onChange }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const cur = selectColor(color);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={"field-opt-color" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className="field-opt-color-btn"
        title="Option color"
        aria-label="Option color"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ background: cur.bg, color: cur.fg }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      />
      {open ? (
        <div className="pop field-opt-swatches" role="listbox">
          {SELECT_COLORS.filter((c) => c.id !== "gray").map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === color}
              title={c.label}
              className={
                "field-opt-swatch" + (c.id === color ? " on" : "")
              }
              style={{ background: c.bg }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange?.(c.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function FieldEditDialog({
  col,
  isNew = false,
  canDelete = true,
  onSave,
  onDelete,
  onClose,
}) {
  const [draft, setDraft] = useState(() =>
    normalizeDbCol(col) || blankCol()
  );
  const [optDraft, setOptDraft] = useState("");
  const nameRef = useRef(null);
  const typeMeta = fieldTypeMeta(draft.type);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (partial) => setDraft((d) => ({ ...d, ...partial }));

  const setType = (type) => {
    setDraft((d) => {
      const next = { ...d, type };
      if (type === "number" && next.decimal == null) next.decimal = false;
      if (
        (type === "select" || type === "multiselect") &&
        !Array.isArray(next.options)
      ) {
        next.options = [];
      }
      return next;
    });
  };

  const addOption = () => {
    const label = optDraft.trim();
    if (!label) return;
    setDraft((d) => ({
      ...d,
      options: [
        ...(d.options || []),
        { label, color: nextSelectColor(d.options || []) },
      ],
    }));
    setOptDraft("");
  };

  const submit = () => {
    const label = (draft.label || "").trim();
    if (!label) {
      nameRef.current?.focus();
      return;
    }
    const saved = serializeDbCol({
      ...draft,
      id: draft.id || "f" + Date.now(),
      label,
    });
    onSave?.(saved);
  };

  const remove = async () => {
    if (!canDelete || isNew) return;
    const ok = await askConfirm({
      title: `Delete field "${draft.label || "Untitled"}"?`,
      message: "Values in this column will be removed from all rows.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    onDelete?.(draft);
  };

  return createPortal(
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="dlg prompt-dlg field-edit-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "New field" : "Edit field"}
      >
        <div className="dlg-content prompt-body">
          <h2 className="prompt-title">{isNew ? "New field" : "Edit field"}</h2>
          <form
            className="prompt-form field-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="field-edit-row">
              <span className="field-edit-lab">Field name</span>
              <input
                ref={nameRef}
                className="prompt-input"
                type="text"
                value={draft.label || ""}
                placeholder="Field name"
                onChange={(e) => patch({ label: e.target.value })}
                autoComplete="off"
              />
            </label>

            <div className="field-edit-row">
              <span className="field-edit-lab">Field type</span>
              <Dropdown
                className="field-type-dd"
                value={
                  draft.type === "stage"
                    ? "select"
                    : FIELD_TYPES.some((t) => t.value === draft.type)
                      ? draft.type
                      : "text"
                }
                options={FIELD_TYPES}
                onChange={setType}
                renderOption={(o) => (
                  <span className="field-type-opt">
                    <Icon name={o.icon} size={14} />
                    {o.label}
                  </span>
                )}
              >
                <span className="field-type-opt">
                  <Icon name={typeMeta.icon} size={14} />
                  <span className="dd-lab">{typeMeta.label}</span>
                </span>
              </Dropdown>
            </div>

            <label className="field-edit-check">
              <input
                type="checkbox"
                checked={!!draft.required}
                onChange={(e) => patch({ required: e.target.checked })}
              />
              <span>Required</span>
            </label>

            {draft.type === "number" ? (
              <div className="field-edit-block">
                <label className="field-edit-check">
                  <input
                    type="checkbox"
                    checked={!!draft.decimal}
                    onChange={(e) => patch({ decimal: e.target.checked })}
                  />
                  <span>Decimal</span>
                </label>
                <div className="field-num-preview">
                  Preview: {formatNumberPreview(!!draft.decimal)}
                </div>
              </div>
            ) : null}

            {draft.type === "select" || draft.type === "multiselect" ? (
              <div className="field-edit-block">
                <span className="field-edit-lab">Options</span>
                <ul className="field-opt-list">
                  {(draft.options || []).map((opt, i) => {
                    const c = selectColor(opt.color);
                    return (
                      <li key={i} className="field-opt-item">
                        <OptionColorPicker
                          color={opt.color}
                          onChange={(color) => {
                            const next = (draft.options || []).slice();
                            next[i] = { ...next[i], color };
                            patch({ options: next });
                          }}
                        />
                        <input
                          className="prompt-input field-opt-label"
                          type="text"
                          value={opt.label}
                          style={{
                            ["--chip-bg"]: c.bg,
                            ["--chip-fg"]: c.fg,
                          }}
                          onChange={(e) => {
                            const next = (draft.options || []).slice();
                            next[i] = { ...next[i], label: e.target.value };
                            patch({ options: next });
                          }}
                        />
                        <button
                          type="button"
                          className="field-opt-rm"
                          title="Remove option"
                          aria-label="Remove option"
                          onClick={() => {
                            patch({
                              options: (draft.options || []).filter(
                                (_, j) => j !== i
                              ),
                            });
                          }}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="field-opt-add">
                  <input
                    className="prompt-input"
                    type="text"
                    value={optDraft}
                    placeholder="New option"
                    onChange={(e) => setOptDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="dlg-create"
                    onClick={addOption}
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}

            <div className="actions prompt-actions field-edit-actions">
              {!isNew ? (
                <button
                  type="button"
                  className="dlg-delete"
                  disabled={!canDelete}
                  onClick={remove}
                >
                  Delete
                </button>
              ) : (
                <button type="button" className="dlg-delete" onClick={onClose}>
                  Cancel
                </button>
              )}
              <button type="submit" className="dlg-create">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
