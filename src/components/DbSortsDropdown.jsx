import { useEffect, useRef, useState } from "react";
import { fieldTypeIcon } from "../dbFields.js";
import {
  countActiveSorts,
  createSortRule,
  SORT_DIRS,
} from "../dbSorts.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";

function FieldOption({ col }) {
  return (
    <span className="db-filter-field-opt">
      <Icon name={fieldTypeIcon(col.type)} size={14} />
      <span>{col.label || col.id}</span>
    </span>
  );
}

function defaultFieldId(cols, usedIds = []) {
  const used = new Set(usedIds.filter(Boolean));
  const free = cols.find((c) => c && !used.has(c.id));
  return (free || cols[0])?.id || "";
}

function withDefaultFields(rules, cols) {
  if (!cols.length) return { rules, changed: false };
  const used = [];
  let changed = false;
  const next = (rules?.length ? rules : [createSortRule()]).map((r) => {
    if (r.fieldId && cols.some((c) => c.id === r.fieldId)) {
      used.push(r.fieldId);
      return r;
    }
    const fieldId = defaultFieldId(cols, used);
    if (!fieldId) return r;
    used.push(fieldId);
    changed = true;
    return { ...r, fieldId, dir: r.dir === "desc" ? "desc" : "asc" };
  });
  return { rules: next, changed };
}

function SortRow({
  rule,
  cols,
  onChange,
  onRemove,
  canRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dragging,
}) {
  const col = cols.find((c) => c.id === rule.fieldId) || null;
  const fieldOpts = cols.map((c) => ({
    value: c.id,
    label: c.label || c.id,
    col: c,
  }));
  const dirLabel = SORT_DIRS.find((d) => d.value === rule.dir)?.label || "Up";

  return (
    <div
      className={"db-sort-row" + (dragging ? " dragging" : "")}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="db-filter-remove"
        title="Remove sort"
        aria-label="Remove sort"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </button>

      <Dropdown
        className="db-sort-field-dd"
        options={fieldOpts}
        value={rule.fieldId}
        ariaLabel="Sort field"
        renderOption={(o) => <FieldOption col={o.col} />}
        onChange={(fieldId) => onChange({ ...rule, fieldId })}
      >
        {col ? (
          <FieldOption col={col} />
        ) : (
          <span className="db-filter-placeholder">Select field</span>
        )}
      </Dropdown>

      <Dropdown
        className="db-sort-dir-dd"
        options={SORT_DIRS}
        value={rule.dir || "asc"}
        disabled={!col}
        ariaLabel="Sort direction"
        onChange={(dir) => onChange({ ...rule, dir })}
      >
        <span className="dd-lab">{dirLabel}</span>
      </Dropdown>

      <button
        type="button"
        className="db-sort-handle"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <Icon name="grip" size={14} />
      </button>
    </div>
  );
}

/** Database Sort toolbar: multi-rule sort builder for the current view. */
export default function DbSortsDropdown({ cols = [], sorts, onChange }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const activeCount = countActiveSorts(sorts, cols);
  const rules = sorts?.rules?.length ? sorts.rules : [createSortRule()];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const setRules = (nextRules) => {
    onChange({ rules: nextRules });
  };

  const updateRule = (id, next) => {
    setRules(rules.map((r) => (r.id === id ? next : r)));
  };

  const removeRule = (id) => {
    const next = rules.filter((r) => r.id !== id);
    setRules(next.length ? next : [createSortRule()]);
  };

  const addRule = () => {
    const used = rules.map((r) => r.fieldId);
    setRules([
      ...rules,
      { ...createSortRule(), fieldId: defaultFieldId(cols, used) },
    ]);
  };

  const moveRule = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const from = rules.findIndex((r) => r.id === fromId);
    const to = rules.findIndex((r) => r.id === toId);
    if (from < 0 || to < 0) return;
    const next = rules.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setRules(next);
  };

  return (
    <div className={"db-sorts-dd" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className={"mod-act" + (open || activeCount > 0 ? " on" : "")}
        aria-label="Sort"
        title="Sort"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) {
              const hydrated = withDefaultFields(rules, cols);
              if (hydrated.changed) onChange({ rules: hydrated.rules });
            }
            return next;
          });
        }}
      >
        <Icon name="sort" size={18} />
        <span className="mod-act-lab">
          {activeCount > 0 ? `${activeCount} Sort${activeCount === 1 ? "" : "s"}` : "Sort"}
        </span>
      </button>
      {open ? (
        <div className="pop db-sorts-menu" role="dialog" aria-label="Sort builder">
          <div className="db-sorts-rows">
            {rules.map((rule) => (
              <SortRow
                key={rule.id}
                rule={rule}
                cols={cols}
                dragging={dragId === rule.id}
                onChange={(next) => updateRule(rule.id, next)}
                onRemove={() => removeRule(rule.id)}
                canRemove={rules.length > 1 || activeCount > 0 || !!rule.fieldId}
                onDragStart={(e) => {
                  setDragId(rule.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", rule.id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = e.dataTransfer.getData("text/plain") || dragId;
                  moveRule(fromId, rule.id);
                  setDragId(null);
                }}
              />
            ))}
          </div>
          <button type="button" className="db-filters-add" onClick={addRule}>
            <Icon name="plus" size={14} />
            Add sort
          </button>
        </div>
      ) : null}
    </div>
  );
}
