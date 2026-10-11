import { useEffect, useState } from "react";
import { fetchTrash } from "../api.js";
import { Icon } from "../icons.jsx";
import { GACC, formatTrashDate } from "../utils.js";
import GlobalBar from "./GlobalBar.jsx";

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

function trashMeta(entry) {
  const type = trashKindLabel(entry.kind || "card");
  const project = entry.projectName || entry.project || "Project";
  const kind = entry.kind || "card";
  if (kind === "project") return type;
  if (kind === "note") {
    const tab = entry.notesTabName || entry.notesTab || "Notes";
    return `${type} on ${project} / ${tab}`;
  }
  if (kind === "file") {
    const tab = entry.filesTabName || entry.filesTab || "Files";
    return `${type} on ${project} / ${tab}`;
  }
  if (kind === "board" || kind === "notesTab" || kind === "filesTab") {
    return `${type} in ${project}`;
  }
  const board = entry.boardName || entry.board || "Board";
  return `${type} on ${project} / ${board}`;
}

function canPreview(entry) {
  const kind = entry.kind || "card";
  return kind === "card" || kind === "note";
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
    <div id="view" className="mod" style={{ ["--tab"]: tabC }}>
      <GlobalBar name="Trash" />
      <div className="log trash">
        <header className="log-period-head">
          <h3>Items in Trash older than 30 days are permanently deleted.</h3>
        </header>
        {items == null && <div className="empty-log">Loading…</div>}
        {items && !items.length && (
          <div className="empty-log">Trash is empty.</div>
        )}
        {items && items.length > 0 && (
          <div className="trash-list">
            {items.map((entry) => {
              const kind = entry.kind || "card";
              const previewable = canPreview(entry);
              return (
                <div className="entry trash-entry" key={entry.id}>
                  <time dateTime={entry.deletedAt || ""}>
                    {formatTrashDate(entry.deletedAt)}
                  </time>
                  <span
                    className="trash-kind"
                    title={trashKindLabel(kind)}
                    aria-hidden="true"
                  >
                    <Icon name={trashKindIcon(kind)} size={20} />
                  </span>
                  <div className="who">
                    {previewable ? (
                      <button
                        type="button"
                        onClick={() => onPreview?.(entry)}
                        title="Preview"
                      >
                        <b>{entry.title || "Untitled"}</b>
                        <div className="meta">
                          <span
                            className="dot"
                            style={{ background: entry.color || GACC }}
                          />
                          <span>{trashMeta(entry)}</span>
                        </div>
                      </button>
                    ) : (
                      <>
                        <b>{entry.title || "Untitled"}</b>
                        <div className="meta">
                          <span
                            className="dot"
                            style={{ background: entry.color || GACC }}
                          />
                          <span>{trashMeta(entry)}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="trash-restore"
                    disabled={busyId === entry.id}
                    onClick={() => handleRestore(entry)}
                    title={`Restore ${trashKindLabel(kind).toLowerCase()}`}
                  >
                    {busyId === entry.id ? "Restoring…" : "Restore"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
