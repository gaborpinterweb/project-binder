import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons.jsx";

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

function renderOptions({ options, value, onChange, renderOption, close }) {
  return options.map((o) => {
    const val = optionValue(o);
    const selectedOpt = val === value;
    return (
      <button
        key={optionKey(o)}
        type="button"
        role="option"
        aria-selected={selectedOpt}
        className={selectedOpt ? "on" : ""}
        onClick={(e) => {
          e.stopPropagation();
          onChange?.(val, o);
          close?.();
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
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
        <div className={"pop dd-menu" + (menuClassName ? " " + menuClassName : "")} style={{ display: "block" }} role="listbox">
          {sections?.length
            ? sections.map((sec, i) => (
                <div key={sec.key || sec.label || i} className="dd-section" role="group" aria-label={sec.label}>
                  {sec.label ? <div className="dd-heading">{sec.label}</div> : null}
                  {renderOptions({
                    options: sec.options || [],
                    value: sec.value,
                    onChange: sec.onChange,
                    renderOption: sec.renderOption || renderOption,
                    close,
                  })}
                </div>
              ))
            : renderOptions({ options, value, onChange, renderOption, close })}
        </div>
      )}
    </div>
  );
}
