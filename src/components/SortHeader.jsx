import { Icon } from "../icons.jsx";

export default function SortHeader({ col, label, sort, onSort }) {
  const active = sort.key === col;
  return (
    <button
      type="button"
      className={"files-sort" + (active ? " on" : "")}
      onClick={() => onSort(col)}
      aria-label={
        active
          ? `${label}, sorted ${sort.dir === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`
      }
    >
      {label}
      {active ? (
        <span
          className={"files-sort-caret" + (sort.dir === "asc" ? " up" : "")}
          aria-hidden="true"
        >
          <Icon name="caret" size={12} />
        </span>
      ) : null}
    </button>
  );
}
