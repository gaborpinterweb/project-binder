import { fieldTypeIcon, isNameCol } from "../dbFields.js";
import { normalizeHiddenCols } from "../dbViews.js";
import { Icon } from "../icons.jsx";

/** Column visibility checklist for the current database view. */
export function DbColumnsPanel({ cols = [], hiddenCols = [], onChange }) {
  const hidden = normalizeHiddenCols(hiddenCols);
  const hiddenSet = new Set(hidden);

  const toggleCol = (id) => {
    if (isNameCol({ id })) return;
    if (hiddenSet.has(id)) {
      onChange(hidden.filter((h) => h !== id));
      return;
    }
    onChange([...hidden, id]);
  };

  return (
    <div className="db-cols-list" role="group" aria-label="Visible columns">
      {cols.map((col) => {
        const locked = isNameCol(col);
        const checked = locked || !hiddenSet.has(col.id);
        return (
          <label
            key={col.id}
            className={"db-cols-item" + (locked ? " locked" : "")}
            title={locked ? "Name is always visible" : undefined}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={locked}
              onChange={() => toggleCol(col.id)}
            />
            <Icon name={fieldTypeIcon(col.type)} size={14} />
            <span>{col.label || col.id}</span>
          </label>
        );
      })}
    </div>
  );
}
