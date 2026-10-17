import { useEffect, useRef, useState } from "react";
import { normalizeHiddenCols } from "../dbViews.js";
import { Icon } from "../icons.jsx";
import { DbColumnsPanel } from "./DbColumnsDropdown.jsx";

/** Database View toolbar: column visibility + display options for the active preset. */
export default function DbViewDropdown({
  cols = [],
  hiddenCols = [],
  wrapLines = false,
  verticalBorders = true,
  onHiddenColsChange,
  onWrapLinesChange,
  onVerticalBordersChange,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const hiddenCount = cols.filter(
    (c) => c && normalizeHiddenCols(hiddenCols).includes(c.id)
  ).length;
  // Highlight when display options deviate from defaults (wrap off, borders on).
  const active = hiddenCount > 0 || !!wrapLines || !verticalBorders;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={"db-view-dd" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className={"mod-act" + (open || active ? " on" : "")}
        aria-label="View options"
        title="View options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="eye" size={18} />
        <span className="mod-act-lab">View</span>
      </button>
      {open ? (
        <div className="pop db-view-menu" role="dialog" aria-label="View options">
          <section className="db-view-section" aria-label="Display">
            <div className="db-view-section-lab">Display</div>
            <label className="db-view-toggle">
              <input
                type="checkbox"
                checked={!!wrapLines}
                onChange={(e) => onWrapLinesChange?.(e.target.checked)}
              />
              <span>Wrap lines</span>
            </label>
            <label className="db-view-toggle">
              <input
                type="checkbox"
                checked={!!verticalBorders}
                onChange={(e) => onVerticalBordersChange?.(e.target.checked)}
              />
              <span>Vertical borders</span>
            </label>
          </section>
          <section className="db-view-section" aria-label="Columns">
            <div className="db-view-section-lab">Columns</div>
            <DbColumnsPanel
              cols={cols}
              hiddenCols={hiddenCols}
              onChange={onHiddenColsChange}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
