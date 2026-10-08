import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { postNote, putNote, deleteNoteApi, moveNoteApi } from "../api.js";
import { Icon } from "../icons.jsx";
import {
  allNotesTabs,
  noteListTitle,
  noteListPreview,
  isEmptyNoteBody,
} from "../utils.js";
import { askConfirm } from "../confirmDialog.js";
import Dropdown from "./Dropdown.jsx";
import RichTextEditor, { RteToolbar } from "./RichTextEditor.jsx";

const EMPTY_NOTE_BODY = "<h1></h1>";
const NOTE_PLACEHOLDER = "New note...";

const NOTE_SORT_OPTIONS = [
  { value: "created-asc", label: "Creation ascending" },
  { value: "created-desc", label: "Creation descending" },
  { value: "updated-asc", label: "Updated ascending" },
  { value: "updated-desc", label: "Updated descending" },
  { value: "alpha-asc", label: "Alphabetical ascending" },
  { value: "alpha-desc", label: "Alphabetical descending" },
];

const NOTE_SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

const NOTE_PREVIEW_LEN = { sm: 0, md: 140, lg: 280 };

function previewHtml(body) {
  if (!body) return "<p></p>";
  return body;
}

function clampMenuPos(left, top, menuEl) {
  const pad = 8;
  const w = menuEl?.offsetWidth || 180;
  const h = menuEl?.offsetHeight || 160;
  return {
    left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
    top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
  };
}

/** Fixed-position menu for note list right-click. */
function NoteContextMenu({
  left,
  top,
  moveOptions = [],
  onMove,
  onDuplicate,
  onDelete,
  onClose,
}) {
  const wrapRef = useRef(null);
  const leaveTimer = useRef(0);
  const [pos, setPos] = useState({ left, top });
  const [moveOpen, setMoveOpen] = useState(false);
  const canMove = moveOptions.length > 0;

  useEffect(() => {
    setPos(clampMenuPos(left, top, wrapRef.current));
  }, [left, top]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const run = (fn) => {
    onClose?.();
    fn?.();
  };

  const showMove = () => {
    if (!canMove) return;
    window.clearTimeout(leaveTimer.current);
    setMoveOpen(true);
  };

  const hideMove = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setMoveOpen(false), 120);
  };

  return (
    <div
      ref={wrapRef}
      className="pop dd-menu notes-ctx-menu"
      role="menu"
      aria-label="Note options"
      style={{ display: "block", left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className={"notes-ctx-move" + (moveOpen ? " open" : "")}
        onMouseEnter={showMove}
        onMouseLeave={hideMove}
      >
        <button
          type="button"
          role="menuitem"
          className="notes-ctx-move-btn"
          disabled={!canMove}
          aria-haspopup="menu"
          aria-expanded={moveOpen && canMove}
          onClick={(e) => {
            e.stopPropagation();
            if (!canMove) return;
            window.clearTimeout(leaveTimer.current);
            setMoveOpen((o) => !o);
          }}
        >
          <Icon name="move" size={14} />
          <span className="notes-ctx-move-lab">Move</span>
          <span className="notes-ctx-move-caret" aria-hidden="true">
            <Icon name="arrow" size={12} />
          </span>
        </button>
        {moveOpen && canMove ? (
          <div className="pop notes-ctx-move-pop" role="menu" aria-label="Move to tab">
            {moveOptions.map((t) => (
              <button
                key={t.value}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  run(() => onMove?.(t));
                }}
              >
                <span
                  className="notes-ctx-move-dot"
                  style={{ background: t.color || "var(--acc)" }}
                />
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          run(onDuplicate);
        }}
      >
        Duplicate
      </button>
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={(e) => {
          e.stopPropagation();
          run(onDelete);
        }}
      >
        <Icon name="Trash" size={14} />
        Delete
      </button>
    </div>
  );
}

function sortNotes(list, sort) {
  const notes = [...(list || [])];
  const byTime = (a, b, key, dir) => {
    const cmp = String(a[key] || "").localeCompare(String(b[key] || ""));
    return dir === "asc" ? cmp : -cmp;
  };
  const byAlpha = (a, b, dir) => {
    const cmp = noteListTitle(a.body).localeCompare(noteListTitle(b.body), undefined, {
      sensitivity: "base",
    });
    return dir === "asc" ? cmp : -cmp;
  };
  switch (sort) {
    case "created-asc":
      return notes.sort((a, b) => byTime(a, b, "createdAt", "asc"));
    case "created-desc":
      return notes.sort((a, b) => byTime(a, b, "createdAt", "desc"));
    case "updated-asc":
      return notes.sort((a, b) => byTime(a, b, "updatedAt", "asc"));
    case "alpha-asc":
      return notes.sort((a, b) => byAlpha(a, b, "asc"));
    case "alpha-desc":
      return notes.sort((a, b) => byAlpha(a, b, "desc"));
    case "updated-desc":
    default:
      return notes.sort((a, b) => byTime(a, b, "updatedAt", "desc"));
  }
}

export default function Notes({
  mod,
  folder,
  folders = [],
  tabC,
  readonly,
  onApplyWorkspace,
}) {
  const d = mod[2] || { slug: "", notes: [] };
  const [sort, setSort] = useState("updated-desc");
  const [cardSize, setCardSize] = useState("md");
  const notes = useMemo(() => sortNotes(d.notes, sort), [d.notes, sort]);
  const [selectedSlug, setSelectedSlug] = useState(notes[0]?.slug || null);
  const [unlocked, setUnlocked] = useState({});
  const [editor, setEditor] = useState(null);
  const [toolbarMounted, setToolbarMounted] = useState(false);
  const [toolbarIn, setToolbarIn] = useState(false);
  const [editingView, setEditingView] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const moveOptions = useMemo(() => {
    const currentKey = `${folder?.slug || ""}/${d.slug || ""}`;
    return allNotesTabs(folders)
      .filter((t) => t.key !== currentKey)
      .map((t) => ({
        value: t.key,
        label: t.label,
        color: t.color,
        folder: t.folder,
        mod: t.mod,
      }));
  }, [folders, folder?.slug, d.slug]);

  const unlockKey = (noteSlug) => `${d.slug}:${noteSlug}`;
  const locked = !selectedSlug || !unlocked[unlockKey(selectedSlug)];

  const setLocked = (next) => {
    if (!selectedSlug) return;
    const key = unlockKey(selectedSlug);
    setUnlocked((prev) => {
      if (next) {
        if (!prev[key]) return prev;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  };

  useEffect(() => {
    if (selectedSlug && notes.some((n) => n.slug === selectedSlug)) return;
    setSelectedSlug(notes[0]?.slug || null);
  }, [notes, selectedSlug]);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    let timeout = 0;
    if (!selectedSlug || locked) {
      setToolbarIn(false);
      timeout = window.setTimeout(() => {
        setToolbarMounted(false);
        setEditingView(false);
        setEditor(null);
      }, 240);
      return () => window.clearTimeout(timeout);
    }
    setEditingView(true);
    if (!editor) {
      setToolbarIn(false);
      return undefined;
    }
    setToolbarMounted(true);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setToolbarIn(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [locked, selectedSlug, editor]);

  const selected = notes.find((n) => n.slug === selectedSlug) || null;

  const saveBody = async (body) => {
    if (!selected || readonly) return;
    const data = await putNote({
      project: folder.slug,
      notesTab: d.slug,
      note: selected.slug,
      title: noteListTitle(body),
      body,
    });
    onApplyWorkspace(data);
  };

  const addNote = async () => {
    if (readonly) return;
    const data = await postNote({
      project: folder.slug,
      notesTab: d.slug,
      title: "New note...",
      body: EMPTY_NOTE_BODY,
    });
    onApplyWorkspace(data);
    if (data.slug) {
      setSelectedSlug(data.slug);
      setUnlocked((prev) => ({ ...prev, [unlockKey(data.slug)]: true }));
    }
  };

  const clearNoteUnlock = (noteSlug) => {
    const key = unlockKey(noteSlug);
    setUnlocked((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const deleteNote = async (note = selected) => {
    if (!note || readonly) return;
    const title = noteListTitle(note.body) || "this note";
    const ok = await askConfirm({
      title: `Delete "${title}"?`,
      message: "It will move to Trash and can be restored within 30 days.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const data = await deleteNoteApi({
      project: folder.slug,
      notesTab: d.slug,
      note: note.slug,
    });
    clearNoteUnlock(note.slug);
    if (selectedSlug === note.slug) setSelectedSlug(null);
    onApplyWorkspace(data);
  };

  const moveNote = async (dest, note = selected) => {
    if (!note || readonly || !dest?.folder || !dest?.mod) return;
    const toProject = dest.folder.slug;
    const toNotesTab = dest.mod[2]?.slug;
    if (!toProject || !toNotesTab) return;
    try {
      const data = await moveNoteApi({
        project: folder.slug,
        notesTab: d.slug,
        note: note.slug,
        toProject,
        toNotesTab,
      });
      clearNoteUnlock(note.slug);
      if (selectedSlug === note.slug) setSelectedSlug(null);
      onApplyWorkspace(data, {
        keepNav: { project: toProject, board: toNotesTab, g: null },
      });
    } catch (err) {
      alert(err?.message || "Could not move note.");
    }
  };

  const duplicateNote = async (note) => {
    if (!note || readonly) return;
    const title = noteListTitle(note.body) || "Untitled";
    const data = await postNote({
      project: folder.slug,
      notesTab: d.slug,
      title,
      body: note.body || EMPTY_NOTE_BODY,
    });
    onApplyWorkspace(data);
    if (data.slug) {
      setSelectedSlug(data.slug);
      setUnlocked((prev) => ({ ...prev, [unlockKey(data.slug)]: true }));
    }
  };

  const selectNote = (slug) => {
    if (slug === selectedSlug) return;
    setSelectedSlug(slug);
  };

  const openNoteCtx = (e, note) => {
    if (readonly || !note) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedSlug(note.slug);
    setCtxMenu({ left: e.clientX, top: e.clientY, note });
  };

  return (
    <div id="view" className="mod notes-view" style={{ ["--tab"]: tabC }}>
      <div className="modbar notes-chrome">
        <div className="modbar-start">
          {!readonly && (
            <button
              type="button"
              className="mod-act"
              onClick={addNote}
              title="Add note"
              aria-label="Add note"
            >
              <Icon name="plus" size={18} />
              <span className="mod-act-lab">Add note</span>
            </button>
          )}
          <Dropdown
            className="mod-view-dd"
            buttonClassName="mod-act"
            ariaLabel="View options"
            title="View options"
            align="left"
            caret={false}
            sections={[
              {
                label: "Card size",
                value: cardSize,
                onChange: setCardSize,
                options: NOTE_SIZE_OPTIONS,
              },
            ]}
          >
            <Icon name="eye" size={18} />
            <span className="mod-act-lab">View</span>
          </Dropdown>
          <Dropdown
            className="mod-view-dd"
            buttonClassName="mod-act"
            ariaLabel="Sort options"
            title="Sort options"
            align="left"
            caret={false}
            value={sort}
            options={NOTE_SORT_OPTIONS}
            onChange={setSort}
          >
            <Icon name="sort" size={18} />
            <span className="mod-act-lab">Sort</span>
          </Dropdown>
        </div>
        <div className="notes-toolbar-mid">
          {toolbarMounted && (
            <div
              className={"notes-toolbar-anim" + (toolbarIn ? " in" : "")}
              aria-hidden={!toolbarIn}
            >
              <RteToolbar
                editor={editor}
                forNotes
                moveOptions={readonly ? [] : moveOptions}
                onMove={readonly ? undefined : (dest) => moveNote(dest)}
                onDelete={readonly ? undefined : () => deleteNote()}
              />
            </div>
          )}
        </div>
        <div className="modbar-end">
          {selected && !readonly && (
            locked ? (
              <button
                type="button"
                className="mod-act"
                onClick={() => setLocked(false)}
                title="Edit note"
                aria-label="Edit note"
              >
                <Icon name="pencil" size={18} />
                <span className="mod-act-lab">Edit note</span>
              </button>
            ) : (
              <button
                type="button"
                className="mod-act on"
                onClick={() => setLocked(true)}
                title="Lock note"
                aria-label="Lock note"
              >
                <Icon name="lock" size={18} />
                <span className="mod-act-lab">Lock note</span>
              </button>
            )
          )}
        </div>
      </div>
      <div className="notes-layout">
        <aside className="notes-sidebar">
          {notes.length === 0 ? (
            <p className="notes-empty">No notes yet</p>
          ) : (
            <div className={"notes-list size-" + cardSize}>
              {notes.map((n) => {
                const preview =
                  cardSize === "sm"
                    ? ""
                    : noteListPreview(n.body, NOTE_PREVIEW_LEN[cardSize] || 140);
                return (
                  <button
                    key={n.slug}
                    type="button"
                    className={"notes-item" + (n.slug === selectedSlug ? " on" : "")}
                    onClick={() => selectNote(n.slug)}
                    onContextMenu={(e) => openNoteCtx(e, n)}
                  >
                    <span className="notes-item-title">{noteListTitle(n.body)}</span>
                    {preview ? (
                      <span className="notes-item-preview">{preview}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
        <div className="notes-main">
          {!selected ? (
            <p className="notes-placeholder">Nothing is selected</p>
          ) : editingView ? (
            <div className="notes-rte-wrap">
              <RichTextEditor
                key={selected.slug}
                value={selected.body || EMPTY_NOTE_BODY}
                onChange={saveBody}
                showLabel={false}
                showToolbar={false}
                forNotes
                autofocus
                startInHeading
                onEditor={setEditor}
                placeholder={NOTE_PLACEHOLDER}
              />
            </div>
          ) : (
            <div className="notes-rte-wrap notes-preview">
              <div className="rte">
                {isEmptyNoteBody(selected.body) ? (
                  <div className="tiptap">
                    <h1 className="notes-empty-title">{NOTE_PLACEHOLDER}</h1>
                  </div>
                ) : (
                  <div
                    className="tiptap"
                    dangerouslySetInnerHTML={{ __html: previewHtml(selected.body) }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {ctxMenu
        ? createPortal(
            <NoteContextMenu
              left={ctxMenu.left}
              top={ctxMenu.top}
              moveOptions={moveOptions}
              onMove={(dest) => moveNote(dest, ctxMenu.note)}
              onDuplicate={() => duplicateNote(ctxMenu.note)}
              onDelete={() => deleteNote(ctxMenu.note)}
              onClose={() => setCtxMenu(null)}
            />,
            document.body
          )
        : null}
    </div>
  );
}
