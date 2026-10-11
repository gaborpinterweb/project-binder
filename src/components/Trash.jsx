import { useEffect, useMemo, useState } from "react";
import { fetchTrash } from "../api.js";
import { Icon } from "../icons.jsx";
import { GACC } from "../utils.js";
import GlobalBar from "./GlobalBar.jsx";
import SortHeader from "./SortHeader.jsx";

const DEFAULT_TRASH_SORT = { key: "deleted", dir: "desc" };
const TRASH_SORT_DEFAULT_DIR = {
  name: "asc",
  type: "asc",
  project: "asc",
  deleted: "desc",
};

function trashKindLabel(kind) {
  if (kind === "project") return "Project";
  if (kind === "note") return "Note";
  if (kind === "board") return "Board";
  if (kind === "notesTab") return "Notes tab";
  if (kind === "filesTab") return "Files tab";
  if (kind === "file") return "File";
  return "Task";
}

function trashKindIcon(kind) {
  if (kind === "project") return "folder";
  if (kind === "note" || kind === "notesTab") return "Notes";
  if (kind === "board") return "Board";
  if (kind === "file" || kind === "filesTab") return "Files";
  return "Task";
}

function trashProjectLabel(entry) {
  if ((entry.kind || "card") === "project") return "—";
  return entry.projectName || entry.project || "—";
}

function formatDeletedDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function canPreview(entry) {
  const kind = entry.kind || "card";
  return kind === "card" || kind === "note";
}

function sortTrash(list, sort) {
  const items = [...(list || [])];
  const dir = sort?.dir === "asc" ? 1 : -1;
  const key = sort?.key || "deleted";
  items.sort((a, b) => {
    let cmp = 0;
    if (key === "name") {
      cmp = String(a.title || "").localeCompare(String(b.title || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    } else if (key === "type") {
      cmp = trashKindLabel(a.kind || "card").localeCompare(
        trashKindLabel(b.kind || "card"),
        undefined,
        { sensitivity: "base" },
      );
    } else if (key === "project") {
      cmp = trashProjectLabel(a).localeCompare(trashProjectLabel(b), undefined, {
        sensitivity: "base",
      });
    } else {
      cmp = String(a.deletedAt || "").localeCompare(String(b.deletedAt || ""));
    }
    if (!cmp) cmp = String(a.id || "").localeCompare(String(b.id || ""));
    return cmp * dir;
  });
  return items;
}

export function TrashNotePreview({ entry, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ov ov-top"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dlg trash-note-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={entry.title || "Note"}
      >
        <div className="dlg-content trash-note-body">
          <div
            className="tiptap"
            dangerouslySetInnerHTML={{
              __html: entry.body || "<p></p>",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Trash({ tabC = GACC, refreshKey, onRestore, onPreview }) {
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [sort, setSort] = useState(DEFAULT_TRASH_SORT);
  const sortedItems = useMemo(() => sortTrash(items, sort), [items, sort]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetchTrash()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const toggleSort = (col) => {
    setSort((prev) =>
      prev.key === col
        ? { key: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col, dir: TRASH_SORT_DEFAULT_DIR[col] || "asc" },
    );
  };

  const handleRestore = async (entry) => {
    if (!onRestore || busyId) return;
    setBusyId(entry.id);
    try {
      await onRestore(entry);
    } catch (err) {
      alert(err?.message || "Could not restore item.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      id="view"
      className="mod files-view trash-view"
      style={{ ["--tab"]: tabC }}
    >
      <GlobalBar name="Trash" />
      <div className="log-note trash-note">
        Items in Trash older than 30 days are permanently deleted.
      </div>
      <div className="files-body">
        {items == null && <div className="files-empty">Loading…</div>}
        {items && !items.length && (
          <div className="files-empty">Trash is empty.</div>
        )}
        {items && items.length > 0 && (
          <div className="files-table">
            <div className="files-head">
              <span className="files-head-icon" />
              <span className="files-head-name">
                <SortHeader col="name" label="Name" sort={sort} onSort={toggleSort} />
              </span>
              <span className="trash-col-type">
                <SortHeader col="type" label="Type" sort={sort} onSort={toggleSort} />
              </span>
              <span className="trash-col-project">
                <SortHeader
                  col="project"
                  label="Project"
                  sort={sort}
                  onSort={toggleSort}
                />
              </span>
              <span className="trash-col-deleted">
                <SortHeader
                  col="deleted"
                  label="Deleted"
                  sort={sort}
                  onSort={toggleSort}
                />
              </span>
              <span className="trash-col-restore" />
            </div>
            <ul className="files-list">
              {sortedItems.map((entry) => {
                const kind = entry.kind || "card";
                const previewable = canPreview(entry);
                const title = entry.title || "Untitled";
                const project = trashProjectLabel(entry);
                return (
                  <li className="files-row trash-row" key={entry.id}>
                    <span
                      className="trash-kind-icon"
                      title={trashKindLabel(kind)}
                      aria-hidden="true"
                    >
                      <Icon name={trashKindIcon(kind)} size={18} />
                    </span>
                    {previewable ? (
                      <button
                        type="button"
                        className="files-name"
                        title={title}
                        onClick={() => onPreview?.(entry)}
                      >
                        {title}
                      </button>
                    ) : (
                      <span className="files-name is-static" title={title}>
                        {title}
                      </span>
                    )}
                    <span className="trash-col-type">{trashKindLabel(kind)}</span>
                    <span className="trash-col-project">
                      {project === "—" ? (
                        project
                      ) : (
                        <>
                          <span
                            className="trash-project-dot"
                            style={{ background: entry.color || GACC }}
                            aria-hidden="true"
                          />
                          <span className="trash-project-name">{project}</span>
                        </>
                      )}
                    </span>
                    <span className="trash-col-deleted">
                      {formatDeletedDate(entry.deletedAt)}
                    </span>
                    <button
                      type="button"
                      className="trash-restore"
                      disabled={busyId === entry.id}
                      onClick={() => handleRestore(entry)}
                      title={`Restore ${trashKindLabel(kind).toLowerCase()}`}
                    >
                      {busyId === entry.id ? "Restoring…" : "Restore"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
