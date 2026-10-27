import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import RichTextEditor from "./RichTextEditor.jsx";

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

function asDraftText(v) {
  return v === "" || v == null ? "" : String(v);
}

function parseNumberCommit(raw) {
  if (raw === "" || raw == null) return "";
  const n = Number(String(raw).trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : "";
}

function stripNewlines(s) {
  return String(s ?? "").replace(/[\r\n]+/g, "");
}

/** Shared Notion-style cell float — keeps table row height stable. */
function useCellFloat({
  value,
  readOnly = false,
  autoFocus = false,
  minWidth = 280,
  toDraft = asDraftText,
  fromDraft = (d) => d,
  onCommit,
}) {
  const anchorRef = useRef(null);
  const floatRef = useRef(null);
  const draftRef = useRef(toDraft(value));
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const toDraftRef = useRef(toDraft);
  const fromDraftRef = useRef(fromDraft);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  const [draft, setDraft] = useState(() => toDraft(value));

  valueRef.current = value;
  onCommitRef.current = onCommit;
  toDraftRef.current = toDraft;
  fromDraftRef.current = fromDraft;

  const measure = () => {
    const el = anchorRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const width = Math.min(
      Math.max(r.width, minWidth),
      Math.max(160, window.innerWidth - 16)
    );
    let left = Math.min(r.left, window.innerWidth - width - 8);
    left = Math.max(8, left);
    const top = Math.min(Math.max(8, r.top), window.innerHeight - 120);
    return { left, top, width };
  };

  const openEditor = () => {
    if (readOnly) return;
    const nextDraft = toDraftRef.current(valueRef.current);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    const next = measure();
    if (!next) return;
    setBox(next);
    setOpen(true);
  };

  const closeEditor = (save) => {
    setOpen((was) => {
      if (!was) return false;
      if (save && !readOnly) {
        const next = fromDraftRef.current(draftRef.current);
        if (next !== valueRef.current) onCommitRef.current?.(next);
      }
      setBox(null);
      return false;
    });
  };

  const setDraftValue = (next) => {
    draftRef.current = next;
    setDraft(next);
  };

  useEffect(() => {
    if (!autoFocus || readOnly || open) return;
    openEditor();
  }, [autoFocus, readOnly]); // open once when autofocus mounts

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeEditor(true);
    };
    const onDown = (e) => {
      const t = e.target;
      if (floatRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      if (t?.closest?.(".ov, .rte-table-float")) return;
      closeEditor(true);
    };
    const onReposition = () => {
      const next = measure();
      if (next) setBox(next);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, readOnly]);

  return {
    open,
    box,
    draft,
    setDraftValue,
    draftRef,
    anchorRef,
    floatRef,
    openEditor,
    closeEditor,
  };
}

function CellFloatShell({
  open,
  box,
  floatRef,
  className = "",
  children,
}) {
  if (!open || !box) return null;
  return createPortal(
    <div
      ref={floatRef}
      className={"db-cell-float" + (className ? " " + className : "")}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

function CellPreview({
  anchorRef,
  open,
  readOnly,
  className = "",
  children,
  onOpen,
}) {
  return (
    <div
      ref={anchorRef}
      className={
        "db-cell-text db-cell-preview" +
        (open ? " is-editing" : "") +
        (className ? " " + className : "")
      }
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={() => {
        if (!open) onOpen();
      }}
      onKeyDown={(e) => {
        if (readOnly || open) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {children}
    </div>
  );
}

/** Single-line floating input for text / url / number / date cells. */
function PlainFloatCell({
  value,
  autoFocus = false,
  readOnly = false,
  placeholder = "",
  inputType = "text",
  inputMode,
  className = "",
  displayValue,
  toDraft = asDraftText,
  fromDraft = (d) => d,
  onCommit,
}) {
  const {
    open,
    box,
    draft,
    setDraftValue,
    anchorRef,
    floatRef,
    openEditor,
    closeEditor,
  } = useCellFloat({
    value,
    readOnly,
    autoFocus,
    minWidth: 200,
    toDraft,
    fromDraft,
    onCommit,
  });
  const inputRef = useRef(null);
  const preview =
    displayValue != null ? displayValue : asDraftText(value);

  useEffect(() => {
    if (!open || !inputRef.current) return;
    const el = inputRef.current;
    el.focus();
    if (inputType !== "date") el.select();
  }, [open, inputType]);

  return (
    <>
      <CellPreview
        anchorRef={anchorRef}
        open={open}
        readOnly={readOnly}
        className={className}
        onOpen={openEditor}
      >
        {preview}
      </CellPreview>
      <CellFloatShell
        open={open}
        box={box}
        floatRef={floatRef}
        className="is-plain"
      >
        <input
          ref={inputRef}
          className="db-cell-float-input"
          type={inputType}
          inputMode={inputMode}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            const next =
              inputType === "date"
                ? e.target.value
                : stripNewlines(e.target.value);
            setDraftValue(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              closeEditor(true);
            }
          }}
        />
      </CellFloatShell>
    </>
  );
}

/** Notion-style floating rich editor — keeps table row height stable. */
function LongTextCell({
  value,
  wrapLines = false,
  autoFocus = false,
  readOnly = false,
  onCommit,
}) {
  const {
    open,
    box,
    draftRef,
    anchorRef,
    floatRef,
    openEditor,
  } = useCellFloat({
    value,
    readOnly,
    autoFocus,
    minWidth: 280,
    toDraft: (v) => v ?? "",
    fromDraft: (d) => d ?? "",
    onCommit,
  });
  const preview = plainFromHtml(value) || "";

  return (
    <>
      <CellPreview
        anchorRef={anchorRef}
        open={open}
        readOnly={readOnly}
        className={
          "db-rich-preview" + (wrapLines ? " multiline" : "")
        }
        onOpen={openEditor}
      >
        {preview}
      </CellPreview>
      <CellFloatShell
        open={open}
        box={box}
        floatRef={floatRef}
        className="is-rich"
      >
        <RichTextEditor
          value={draftRef.current}
          label="Rich text"
          showLabel={false}
          showToolbar={!readOnly}
          editable={!readOnly}
          autofocus
          variant="mini"
          placeholder="Write something…"
          onChange={(html) => {
            draftRef.current = html;
          }}
        />
      </CellFloatShell>
    </>
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
  const [text, setText] = useState(() => asDraftText(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(asDraftText(value));
  }, [value]);

  const parseCommit = (raw) => {
    const next = parseNumberCommit(raw);
    setText(asDraftText(next));
    onChange?.(next);
    onCommit?.(next);
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
        const raw = stripNewlines(e.target.value);
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
    if (variant === "prop") {
      return (
        <NumberField
          className="db-num prop"
          value={coerced}
          placeholder={placeholder}
          autoFocus={autoFocus}
          readOnly={readOnly}
          onChange={onChange}
          onCommit={onCommit}
        />
      );
    }
    return (
      <PlainFloatCell
        value={coerced}
        autoFocus={autoFocus}
        readOnly={readOnly}
        placeholder={placeholder || formatNumberValue(1234.56)}
        inputMode="decimal"
        className="db-num-preview"
        fromDraft={parseNumberCommit}
        onCommit={(next) => commit(next)}
      />
    );
  }

  if (col.type === "date") {
    if (variant === "prop") {
      return (
        <input
          className="db-date prop"
          type="date"
          value={coerced || ""}
          autoFocus={autoFocus}
          readOnly={readOnly}
          disabled={readOnly}
          onChange={(e) => commit(e.target.value)}
        />
      );
    }
    return (
      <PlainFloatCell
        value={coerced || ""}
        autoFocus={autoFocus}
        readOnly={readOnly}
        inputType="date"
        className="db-date-preview"
        onCommit={(next) => commit(next)}
      />
    );
  }

  if (col.type === "longtext") {
    if (variant === "prop") return null;
    return (
      <LongTextCell
        value={coerced}
        wrapLines={!!wrapLines}
        autoFocus={autoFocus}
        readOnly={readOnly}
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
            onChange?.(stripNewlines(e.target.value));
          }}
          onBlur={(e) => {
            if (readOnly) return;
            onCommit?.(stripNewlines(e.target.value));
          }}
        />
      );
    }
    const raw = String(coerced || "").trim();
    const href = raw ? hrefForUrlField(raw) : "";
    return (
      <div className="db-url-cell">
        <PlainFloatCell
          value={coerced || ""}
          autoFocus={autoFocus}
          readOnly={readOnly}
          placeholder={placeholder || "https://"}
          inputType="url"
          className="db-url-preview"
          fromDraft={(d) => stripNewlines(d)}
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
          onChange?.(stripNewlines(e.target.value));
        }}
        onBlur={(e) => {
          if (readOnly) return;
          onCommit?.(stripNewlines(e.target.value));
        }}
      />
    );
  }

  return (
    <PlainFloatCell
      value={coerced}
      autoFocus={autoFocus}
      readOnly={readOnly}
      placeholder={placeholder}
      fromDraft={(d) => stripNewlines(d)}
      onCommit={(next) => commit(next)}
    />
  );
}
