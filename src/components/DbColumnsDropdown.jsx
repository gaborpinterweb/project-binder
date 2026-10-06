import { useEffect, useRef, useState } from "react";
import { fieldTypeIcon } from "../dbFields.js";
import { normalizeHiddenCols } from "../dbViews.js";
import { Icon } from "../icons.jsx";

/** Database Columns toolbar: toggle field visibility for the current view. */
export default function DbColumnsDropdown({ cols = [], hiddenCols = [], onChange }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const hidden = normalizeHiddenCols(hiddenCols);
  const hiddenSet = new Set(hidden);
  const hiddenCount = cols.filter((c) => c && hiddenSet.has(c.id)).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleCol = (id) => {
    if (hiddenSet.has(id)) {
      onChange(hidden.filter((h) => h !== id));
      return;
    }
    onChange([...hidden, id]);
  };

  return (
    <div className={"db-cols-dd" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className={"mod-act" + (open || hiddenCount > 0 ? " on" : "")}
        aria-label="Columns"
        title="Columns"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="tableCol" size={18} />
        <span className="mod-act-lab">
          {hiddenCount > 0 ? `${hiddenCount} Hidden` : "Columns"}
        </span>
      </button>
      {open ? (
        <div className="pop db-cols-menu" role="dialog" aria-label="Visible columns">
          <div className="db-cols-list">
            {cols.map((col) => {
              const checked = !hiddenSet.has(col.id);
              return (
                <label key={col.id} className="db-cols-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCol(col.id)}
                  />
                  <Icon name={fieldTypeIcon(col.type)} size={14} />
                  <span>{col.label || col.id}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
