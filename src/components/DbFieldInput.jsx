import { useEffect, useRef, useState } from "react";
import {
  coerceFieldValue,
  findSelectOption,
  formatNumberValue,
  hrefForUrlField,
  plainFromHtml,
  selectColor,
  selectOptions,
} from "../dbFields.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";
import PropDropdown from "./PropDropdown.jsx";

function SelectChip({ label, color, className = "" }) {
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

/** Inline create control for select / multiselect menus. */
function SelectOptionAdd({ onAdd }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const label = text.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      await onAdd?.(label);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="db-opt-add"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        className="db-opt-add-input"
        type="text"
        value={text}
        placeholder="New option"
        disabled={busy}
        aria-label="New option"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }
        }}
      />
      <button
        type="button"
        className="db-opt-add-btn"
        disabled={busy || !text.trim()}
        onClick={(e) => {
          e.stopPropagation();
          submit();
        }}
      >
        Add
      </button>
    </div>
  );
}

function MultiSelectField({
  value,
  options,
  onChange,
  onAddOption,
  className = "",
  readOnly = false,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value.map(String) : [];
  const byValue = new Map((options || []).map((o) => [o.value, o]));
  const canAdd = !readOnly && typeof onAddOption === "function";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (opt) => {
    if (readOnly) return;
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
        disabled={readOnly}
        onClick={(e) => {
          if (readOnly) return;
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
            <div className="dd-heading">{canAdd ? "No options yet" : "No options"}</div>
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
          {canAdd ? (
            <SelectOptionAdd
              onAdd={async (label) => {
                await onAddOption(label);
                if (!selected.includes(label)) {
                  onChange?.([...selected, label]);
                }
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TextCell({
  value,
  multiline = false,
  autoFocus = false,
  className = "",
  readOnly = false,
  onCommit,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (readOnly || !autoFocus || !ref.current) return;
    const el = ref.current;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [autoFocus, readOnly]);

  return (
    <div
      ref={ref}
      className={
        "db-cell-text" +
        (multiline ? " multiline" : "") +
        (className ? " " + className : "")
      }
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onBlur={() => {
        if (readOnly) return;
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

/** Local draft so typing isn’t clobbered by a controlled empty/parent value. */
function NumberField({
  value,
  className = "",
  autoFocus = false,
  placeholder = "",
  readOnly = false,
  onChange,
  onCommit,
}) {
  const asText = (v) => (v === "" || v == null ? "" : String(v));
  const [text, setText] = useState(() => asText(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(asText(value));
  }, [value]);

  const parseCommit = (raw) => {
    if (raw === "" || raw == null) {
      setText("");
      onChange?.("");
      onCommit?.("");
      return;
    }
    const n = Number(String(raw).trim().replace(/,/g, ""));
    if (Number.isFinite(n)) {
      setText(String(n));
      onChange?.(n);
      onCommit?.(n);
    } else {
      setText("");
      onChange?.("");
      onCommit?.("");
    }
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder || formatNumberValue(1234.56)}
      autoFocus={autoFocus}
      readOnly={readOnly}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        if (readOnly) return;
        const raw = e.target.value;
        setText(raw);
        if (raw === "") {
          onChange?.("");
          return;
        }
        const n = Number(String(raw).trim().replace(/,/g, ""));
        onChange?.(Number.isFinite(n) ? n : raw);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (readOnly) return;
        parseCommit(e.target.value);
      }}
    />
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
  wrapLines = false,
  readOnly = false,
  onChange,
  onCommit,
  /** Persist a new select/multiselect option on the column; receives the label. */
  onAddOption,
}) {
  const commit = (next) => {
    if (readOnly) return;
    onChange?.(next);
    onCommit?.(next);
  };
  const coerced = coerceFieldValue(col, value);
  const opts = selectOptions(col, stages);
  const canAddOption =
    !readOnly &&
    typeof onAddOption === "function" &&
    (col.type === "select" || col.type === "multiselect");

  const addOptionFooter = canAddOption
    ? (close) => (
        <SelectOptionAdd
          onAdd={async (label) => {
            await onAddOption(label);
            commit(label);
            close?.();
          }}
        />
      )
    : null;

  if (col.type === "checkbox") {
    return (
      <label className={"db-check" + (variant === "prop" ? " prop" : "")}>
        <input
          type="checkbox"
          checked={!!coerced}
          disabled={readOnly}
          onChange={(e) => commit(e.target.checked)}
        />
      </label>
    );
  }

  if (col.type === "select") {
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

    if (readOnly) {
      return <span className="db-chip-row">{chip}</span>;
    }

    if (variant === "prop") {
      return (
        <PropDropdown
          value={cur}
          options={opts}
          onChange={(next) => commit(next)}
          renderOption={(o) => <ChipOption o={o} />}
          menuFooter={addOptionFooter}
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
        menuFooter={addOptionFooter}
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
        readOnly={readOnly}
        onAddOption={canAddOption ? onAddOption : undefined}
        onChange={(next) => commit(next)}
      />
    );
  }

  if (col.type === "number") {
    return (
      <NumberField
        className={"db-num" + (variant === "prop" ? " prop" : "")}
        value={coerced}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onChange={onChange}
        onCommit={onCommit}
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
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(e) => commit(e.target.value)}
      />
    );
  }

  if (col.type === "longtext") {
    if (variant === "prop") return null;
    // Table edits plain text; card dialog keeps full rich editing.
    const preview = plainFromHtml(coerced) || "";
    return (
      <TextCell
        value={preview}
        multiline={!!wrapLines}
        autoFocus={autoFocus}
        readOnly={readOnly}
        className="db-rich-preview"
        onCommit={(next) => commit(next)}
      />
    );
  }

  if (col.type === "url") {
    if (variant === "prop") {
      return (
        <input
          value={coerced || ""}
          placeholder={placeholder || "https://"}
          autoFocus={autoFocus}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            onChange?.(e.target.value);
          }}
          onBlur={(e) => {
            if (readOnly) return;
            onCommit?.(e.target.value);
          }}
        />
      );
    }
    const raw = String(coerced || "").trim();
    const href = raw ? hrefForUrlField(raw) : "";
    return (
      <div className="db-url-cell">
        <TextCell
          value={coerced || ""}
          autoFocus={autoFocus}
          readOnly={readOnly}
          onCommit={(next) => commit(next)}
        />
        {href ? (
          <a
            className="db-url-open"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title="Open link"
            aria-label="Open link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="external" size={14} />
          </a>
        ) : null}
      </div>
    );
  }

  if (variant === "prop") {
    return (
      <input
        value={coerced || ""}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onChange={(e) => {
          if (readOnly) return;
          onChange?.(e.target.value);
        }}
        onBlur={(e) => {
          if (readOnly) return;
          onCommit?.(e.target.value);
        }}
      />
    );
  }

  return (
    <TextCell
      value={coerced}
      autoFocus={autoFocus}
      readOnly={readOnly}
      onCommit={(next) => commit(next)}
    />
  );
}
