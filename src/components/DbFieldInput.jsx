import { useEffect, useRef, useState } from "react";
import {
  coerceFieldValue,
  findSelectOption,
  formatNumberValue,
  plainFromHtml,
  selectColor,
  selectOptions,
} from "../dbFields.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";
import PropDropdown from "./PropDropdown.jsx";

export function SelectChip({ label, color, className = "" }) {
  const c = selectColor(color);
  return (
    <span
      className={"db-chip" + (className ? " " + className : "")}
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function ChipOption({ o }) {
  return <SelectChip label={o.label} color={o.color} />;
}

function MultiSelectField({ value, options, onChange, className = "" }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value.map(String) : [];
  const byValue = new Map((options || []).map((o) => [o.value, o]));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (opt) => {
    const next = selected.includes(opt)
      ? selected.filter((v) => v !== opt)
      : [...selected, opt];
    onChange?.(next);
  };

  return (
    <div
      className={
        "dd db-multi-dd" +
        (open ? " open" : "") +
        (className ? " " + className : "")
      }
      ref={wrapRef}
    >
      <button
        type="button"
        className="dd-btn db-chip-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="db-chip-row">
          {selected.length === 0 ? (
            <span className="db-chip-placeholder">Select…</span>
          ) : (
            selected.map((v) => {
              const o = byValue.get(v);
              return (
                <SelectChip
                  key={v}
                  label={o?.label || v}
                  color={o?.color || "default"}
                />
              );
            })
          )}
        </span>
        <span className="dd-caret" aria-hidden="true">
          <Icon name="caret" size={12} />
        </span>
      </button>
      {open ? (
        <div className="pop dd-menu" style={{ display: "block" }} role="listbox">
          {(options || []).length === 0 ? (
            <div className="dd-heading">No options</div>
          ) : (
            options.map((opt) => {
              const on = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={on ? "on" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(opt.value);
                  }}
                >
                  <span className="db-multi-opt">
                    <span className="db-multi-check" aria-hidden="true">
                      {on ? "✓" : ""}
                    </span>
                    <SelectChip label={opt.label} color={opt.color} />
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function TextCell({ value, multiline = false, onCommit }) {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      className={"db-cell-text" + (multiline ? " multiline" : "")}
      contentEditable
      suppressContentEditableWarning
      onBlur={() => {
        const next = multiline
          ? ref.current?.innerText ?? ""
          : ref.current?.textContent ?? "";
        if (next !== (value ?? "")) onCommit?.(next);
      }}
    >
      {value ?? ""}
    </div>
  );
}

/**
 * Editable control for a database field value (table cell or card props).
 * @param {"cell"|"prop"} variant
 */
export default function DbFieldInput({
  col,
  value,
  stages = [],
  variant = "cell",
  autoFocus = false,
  placeholder = "",
  onChange,
  onCommit,
}) {
  const commit = (next) => {
    onChange?.(next);
    onCommit?.(next);
  };
  const coerced = coerceFieldValue(col, value);
  const opts = selectOptions(col, stages);

  if (col.type === "checkbox") {
    return (
      <label className={"db-check" + (variant === "prop" ? " prop" : "")}>
        <input
          type="checkbox"
          checked={!!coerced}
          onChange={(e) => commit(e.target.checked)}
        />
      </label>
    );
  }

  if (col.type === "select" || col.type === "stage") {
    const cur = coerced || "";
    const selected = findSelectOption(col, cur, stages);
    const chip = cur ? (
      <SelectChip
        label={selected?.label || cur}
        color={selected?.color || "default"}
      />
    ) : (
      <span className="db-chip-placeholder">Select…</span>
    );

    if (variant === "prop") {
      return (
        <PropDropdown
          value={cur}
          options={opts}
          onChange={(next) => commit(next)}
          renderOption={(o) => <ChipOption o={o} />}
        >
          <span className="lab db-chip-row">{chip}</span>
        </PropDropdown>
      );
    }
    return (
      <Dropdown
        className="table-dd db-select-dd"
        value={cur}
        options={opts}
        onChange={(next) => commit(next)}
        renderOption={(o) => <ChipOption o={o} />}
      >
        <span className="db-chip-row">{chip}</span>
      </Dropdown>
    );
  }

  if (col.type === "multiselect") {
    return (
      <MultiSelectField
        className={variant === "prop" ? "" : "table-dd"}
        value={coerced}
        options={opts}
        onChange={(next) => commit(next)}
      />
    );
  }

  if (col.type === "number") {
    return (
      <input
        className={"db-num" + (variant === "prop" ? " prop" : "")}
        type="number"
        step={col.decimal ? "any" : "1"}
        value={coerced === "" || coerced == null ? "" : coerced}
        placeholder={
          placeholder ||
          (col.decimal
            ? formatNumberValue(1234.56, true)
            : formatNumberValue(1235, false))
        }
        autoFocus={autoFocus}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange?.("");
            return;
          }
          const n = Number(raw);
          onChange?.(Number.isFinite(n) ? n : raw);
        }}
        onBlur={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            commit("");
            return;
          }
          const n = Number(raw);
          commit(Number.isFinite(n) ? (col.decimal ? n : Math.round(n)) : "");
        }}
      />
    );
  }

  if (col.type === "date") {
    return (
      <input
        className={"db-date" + (variant === "prop" ? " prop" : "")}
        type="date"
        value={coerced || ""}
        autoFocus={autoFocus}
        onChange={(e) => commit(e.target.value)}
      />
    );
  }

  if (col.type === "longtext") {
    if (variant === "prop") return null;
    const preview = plainFromHtml(coerced) || "";
    return (
      <div className="db-cell-text db-rich-preview" title={preview}>
        {preview || <span className="db-chip-placeholder">Empty</span>}
      </div>
    );
  }

  if (variant === "prop") {
    return (
      <input
        value={coerced || ""}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
      />
    );
  }

  return <TextCell value={coerced} onCommit={(next) => commit(next)} />;
}
