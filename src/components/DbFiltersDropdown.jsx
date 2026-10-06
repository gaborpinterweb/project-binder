import { useEffect, useRef, useState } from "react";
import {
  fieldTypeIcon,
  selectOptions,
} from "../dbFields.js";
import {
  countActiveFilters,
  createFilterRule,
  opNeedsValue,
  operatorsForType,
} from "../dbFilters.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";

const JUNCTION_OPTS = [
  { value: "and", label: "And" },
  { value: "or", label: "Or" },
];

function FieldOption({ col }) {
  return (
    <span className="db-filter-field-opt">
      <Icon name={fieldTypeIcon(col.type)} size={14} />
      <span>{col.label || col.id}</span>
    </span>
  );
}

function FilterValueInput({ col, stages, value, onChange }) {
  if (!col) return null;

  if (col.type === "select" || col.type === "stage") {
    const opts = selectOptions(col, stages);
    return (
      <Dropdown
        className="db-filter-value-dd"
        options={opts}
        value={value}
        onChange={onChange}
        ariaLabel="Filter value"
      />
    );
  }

  if (col.type === "multiselect") {
    const opts = selectOptions(col, stages);
    return (
      <Dropdown
        className="db-filter-value-dd"
        options={opts}
        value={value}
        onChange={onChange}
        ariaLabel="Filter value"
      />
    );
  }

  if (col.type === "number") {
    return (
      <input
        type="number"
        className="db-filter-value"
        value={value ?? ""}
        placeholder="Value"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (col.type === "date") {
    return (
      <input
        type="date"
        className="db-filter-value"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      className="db-filter-value"
      value={value ?? ""}
      placeholder="Value"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function FilterRow({
  rule,
  index,
  cols,
  stages,
  junction,
  onJunctionChange,
  onChange,
  onRemove,
  canRemove,
}) {
  const col = cols.find((c) => c.id === rule.fieldId) || null;
  const ops = col ? operatorsForType(col.type) : [];
  const fieldOpts = cols.map((c) => ({
    value: c.id,
    label: c.label || c.id,
    col: c,
  }));

  const update = (patch) => onChange({ ...rule, ...patch });

  return (
    <div className="db-filter-row">
      <button
        type="button"
        className="db-filter-remove"
        title="Remove filter"
        aria-label="Remove filter"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </button>

      <div className="db-filter-junction">
        {index === 0 ? (
          <span className="db-filter-junction-spacer" aria-hidden="true" />
        ) : index === 1 ? (
          <Dropdown
            className="db-filter-junction-dd"
            options={JUNCTION_OPTS}
            value={junction}
            onChange={onJunctionChange}
            ariaLabel="Combine filters with"
            caret
          />
        ) : (
          <span className="db-filter-junction-locked">
            {junction === "or" ? "Or" : "And"}
          </span>
        )}
      </div>

      <Dropdown
        className="db-filter-field-dd"
        options={fieldOpts}
        value={rule.fieldId}
        ariaLabel="Field"
        renderOption={(o) => <FieldOption col={o.col} />}
        onChange={(fieldId) => {
          const next = cols.find((c) => c.id === fieldId);
          const nextOps = next ? operatorsForType(next.type) : [];
          const nextOp = nextOps.some((o) => o.value === rule.op)
            ? rule.op
            : nextOps[0]?.value || "";
          update({
            fieldId,
            op: nextOp,
            value: "",
          });
        }}
      >
        {col ? (
          <FieldOption col={col} />
        ) : (
          <span className="db-filter-placeholder">Select field</span>
        )}
      </Dropdown>

      <Dropdown
        className="db-filter-op-dd"
        options={ops}
        value={rule.op}
        disabled={!col}
        ariaLabel="Condition"
        onChange={(op) => update({ op, value: opNeedsValue(op) ? rule.value : "" })}
      >
        {rule.op ? (
          <span className="dd-lab">
            {ops.find((o) => o.value === rule.op)?.label || rule.op}
          </span>
        ) : (
          <span className="db-filter-placeholder">Select logic</span>
        )}
      </Dropdown>

      <div className="db-filter-value-wrap">
        {col && rule.op && opNeedsValue(rule.op) ? (
          <FilterValueInput
            col={col}
            stages={stages}
            value={rule.value}
            onChange={(value) => update({ value })}
          />
        ) : (
          <span className="db-filter-value-empty" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export default function DbFiltersDropdown({
  cols = [],
  stages = [],
  filters,
  onChange,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters, cols);
  const rules = filters?.rules?.length ? filters.rules : [createFilterRule()];
  const junction = filters?.junction === "or" ? "or" : "and";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const setRules = (nextRules, nextJunction = junction) => {
    onChange({ junction: nextJunction, rules: nextRules });
  };

  const updateRule = (id, next) => {
    setRules(rules.map((r) => (r.id === id ? next : r)));
  };

  const removeRule = (id) => {
    const next = rules.filter((r) => r.id !== id);
    setRules(next.length ? next : [createFilterRule()]);
  };

  const addRule = () => {
    setRules([...rules, createFilterRule()]);
  };

  return (
    <div
      className={"db-filters-dd" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className={"mod-act" + (open || activeCount > 0 ? " on" : "")}
        aria-label="Filters"
        title="Filters"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="filter" size={18} />
        <span className="mod-act-lab">
          {activeCount > 0 ? `${activeCount} Filter${activeCount === 1 ? "" : "s"}` : "Filters"}
        </span>
      </button>
      {open ? (
        <div className="pop db-filters-menu" role="dialog" aria-label="Filter builder">
          <div className="db-filters-rows">
            {rules.map((rule, i) => (
              <FilterRow
                key={rule.id}
                rule={rule}
                index={i}
                cols={cols}
                stages={stages}
                junction={junction}
                onJunctionChange={(j) => setRules(rules, j)}
                onChange={(next) => updateRule(rule.id, next)}
                onRemove={() => removeRule(rule.id)}
                canRemove={rules.length > 1 || activeCount > 0 || !!rule.fieldId}
              />
            ))}
          </div>
          <button type="button" className="db-filters-add" onClick={addRule}>
            <Icon name="plus" size={14} />
            Add filter
          </button>
        </div>
      ) : null}
    </div>
  );
}
