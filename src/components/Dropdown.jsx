import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../icons.jsx";

/**
 * Cap a downward-opening menu to the remaining viewport below the anchor.
 * Content scrolls only when it does not fit.
 */
export function fitMenuToViewport(anchorEl, menuEl, { pad = 8, gap = 4 } = {}) {
  if (!anchorEl || !menuEl) return;
  const r = anchorEl.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - gap - pad;
  menuEl.style.maxHeight = `${Math.max(80, Math.floor(below))}px`;
}

function optionValue(o) {
  return typeof o === "object" && o != null && "value" in o ? o.value : o;
}

function optionLabel(o) {
  if (typeof o === "object" && o != null && "label" in o) return o.label;
  return o;
}

function optionKey(o) {
  if (typeof o === "object" && o != null) {
    return o.key ?? o.value ?? String(optionValue(o));
  }
  return String(o);
}

function SubmenuOption({
  option,
  value,
  onChange,
  onHighlight,
  close,
  renderOption,
}) {
  const leaveTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const submenu = Array.isArray(option.submenu) ? option.submenu : [];
  const selectedOpt =
    typeof option === "object" && option != null && "checked" in option
      ? !!option.checked
      : optionValue(option) === value;
  const optDisabled = !!option.disabled;

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const show = () => {
    if (optDisabled) return;
    window.clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className={"dd-sub" + (open ? " open" : "") + (selectedOpt ? " on" : "")}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        role="option"
        aria-selected={selectedOpt}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={"dd-sub-btn" + (selectedOpt ? " on" : "")}
        disabled={optDisabled}
        onMouseEnter={() => {
          if (optDisabled) return;
          onHighlight?.(optionValue(option), option);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (optDisabled) return;
          window.clearTimeout(leaveTimer.current);
          setOpen((o) => !o);
        }}
      >
        {renderOption ? (
          renderOption(option)
        ) : option.icon ? (
          <span className="dd-opt">
            <Icon name={option.icon} size={14} />
            {optionLabel(option)}
          </span>
        ) : (
          optionLabel(option)
        )}
        <span className="dd-sub-caret" aria-hidden="true">
          <Icon name="arrow" size={12} />
        </span>
      </button>
      {open ? (
        <div
          className="pop dd-sub-pop"
          role="listbox"
          aria-label={optionLabel(option)}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {submenu.map((sub) => {
            const subVal = optionValue(sub);
            const subSelected =
              typeof sub === "object" && sub != null && "checked" in sub
                ? !!sub.checked
                : subVal === value;
            const subDisabled =
              typeof sub === "object" && sub != null && !!sub.disabled;
            return (
              <button
                key={optionKey(sub)}
                type="button"
                role="option"
                aria-selected={subSelected}
                className={subSelected ? "on" : ""}
                disabled={subDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (subDisabled) return;
                  onChange?.(subVal, sub);
                  close?.();
                }}
              >
                {typeof sub === "object" && sub?.icon ? (
                  <span className="dd-opt">
                    <Icon name={sub.icon} size={14} />
                    {optionLabel(sub)}
                  </span>
                ) : (
                  optionLabel(sub)
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function renderOptions({
  options,
  value,
  onChange,
  onHighlight,
  renderOption,
  close,
  closeOnSelect = true,
}) {
  return options.map((o) => {
    if (typeof o === "object" && o != null && Array.isArray(o.submenu)) {
      return (
        <SubmenuOption
          key={optionKey(o)}
          option={o}
          value={value}
          onChange={onChange}
          onHighlight={onHighlight}
          close={close}
          renderOption={renderOption}
        />
      );
    }

    const val = optionValue(o);
    const selectedOpt =
      typeof o === "object" && o != null && "checked" in o
        ? !!o.checked
        : val === value;
    const optDisabled =
      typeof o === "object" && o != null && !!o.disabled;
    const keepOpen =
      closeOnSelect === false ||
      (typeof o === "object" && o != null && o.closeOnSelect === false);
    return (
      <button
        key={optionKey(o)}
        type="button"
        role="option"
        aria-selected={selectedOpt}
        className={selectedOpt ? "on" : ""}
        disabled={optDisabled}
        onMouseEnter={() => {
          if (optDisabled) return;
          onHighlight?.(val, o);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (optDisabled) return;
          onChange?.(val, o);
          if (!keepOpen) close?.();
        }}
      >
        {renderOption ? (
          renderOption(o)
        ) : typeof o === "object" && o?.icon ? (
          <span className="dd-opt">
            <Icon name={o.icon} size={14} />
            {optionLabel(o)}
          </span>
        ) : (
          optionLabel(o)
        )}
      </button>
    );
  });
}

/** Generic single-select dropdown (replaces native &lt;select&gt;). */
export default function Dropdown({
  options = [],
  value,
  onChange,
  onHighlight,
  sections,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  ariaLabel,
  title,
  dataTip,
  align = "left",
  disabled = false,
  children,
  renderOption,
  caret = true,
  /** Grow to fit options; scroll only when the viewport is too short. */
  fitToViewport = false,
}) {
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const highlightRef = useRef(onHighlight);
  highlightRef.current = onHighlight;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) return;
    highlightRef.current?.(null);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !fitToViewport) return;
    const menu = menuRef.current;
    const anchor = wrapRef.current;
    const apply = () => fitMenuToViewport(anchor, menu);
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
      if (menu) menu.style.maxHeight = "";
    };
  }, [open, fitToViewport, options, sections]);

  const selected = options.find((o) => optionValue(o) === value);
  const display = children ?? (selected != null ? optionLabel(selected) : value);
  const close = () => setOpen(false);

  return (
    <div
      className={
        "dd" +
        (open ? " open" : "") +
        (align === "right" ? " dd-right" : "") +
        (className ? " " + className : "")
      }
      ref={wrapRef}
    >
      <button
        type="button"
        className={"dd-btn" + (buttonClassName ? " " + buttonClassName : "")}
        aria-label={ariaLabel || title}
        title={dataTip ? undefined : title}
        data-tip={dataTip || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        {children != null ? children : <span className="dd-lab">{display}</span>}
        {caret ? (
          <span className="dd-caret" aria-hidden="true">
            <Icon name="caret" size={12} />
          </span>
        ) : null}
      </button>
      {open && !disabled && (
        <div
          ref={menuRef}
          className={"pop dd-menu" + (menuClassName ? " " + menuClassName : "")}
          style={{ display: "block" }}
          role="listbox"
          onMouseLeave={() => onHighlight?.(null)}
        >
          {sections?.length
            ? sections.map((sec, i) => (
                <div key={sec.key || sec.label || i} className="dd-section" role="group" aria-label={sec.label}>
                  {sec.label ? <div className="dd-heading">{sec.label}</div> : null}
                  {renderOptions({
                    options: sec.options || [],
                    value: sec.value,
                    onChange: sec.onChange,
                    onHighlight: sec.onHighlight || onHighlight,
                    renderOption: sec.renderOption || renderOption,
                    close,
                    closeOnSelect: sec.closeOnSelect !== false,
                  })}
                </div>
              ))
            : renderOptions({
                options,
                value,
                onChange,
                onHighlight,
                renderOption,
                close,
              })}
        </div>
      )}
    </div>
  );
}
