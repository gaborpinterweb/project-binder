import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { postNote, putNote, deleteNoteApi, moveNoteApi, revealTab } from "../api.js";
import { Icon } from "../icons.jsx";
import {
  allNotesTabs,
  folderAppLabel,
  noteListTitle,
  noteListPreview,
  isEmptyNoteBody,
  loadNotesUnlocked,
  saveNotesUnlocked,
  loadNotesSelected,
  saveNotesSelected,
  notesTabKey,
  noteUnlockKey,
} from "../utils.js";
import { copyNoteAs, exportNoteAs } from "../noteExport.js";
import { askConfirm } from "../confirmDialog.js";
import { showSnackbar } from "../snackbar.js";
import Dropdown from "./Dropdown.jsx";
import RichTextEditor, { RteToolbar } from "./RichTextEditor.jsx";

const EMPTY_NOTE_BODY = "<h1></h1>";
const NOTE_PLACEHOLDER = "New note...";

const NOTE_SORT_OPTIONS = [
  { value: "created-asc", label: "Creation ascending", icon: "sortAsc" },
  { value: "created-desc", label: "Creation descending", icon: "sortDesc" },
  { value: "updated-asc", label: "Updated ascending", icon: "sortAsc" },
  { value: "updated-desc", label: "Updated descending", icon: "sortDesc" },
  { value: "alpha-asc", label: "Alphabetical ascending", icon: "sortAlphaAsc" },
  { value: "alpha-desc", label: "Alphabetical descending", icon: "sortAlphaDesc" },
];

const NOTE_SIZE_OPTIONS = [
  { value: "sm", label: "Small", icon: "rows2" },
  { value: "md", label: "Medium", icon: "rows3" },
  { value: "lg", label: "Large", icon: "rows4" },
];

const NOTE_SHOW_OPTIONS = [
  { value: "created", label: "Show creation date" },
  { value: "updated", label: "Show update date" },
];

const NOTE_FILTER_SECTIONS = [
  {
    key: "all",
    options: [{ value: "all", label: "All", icon: "list" }],
  },
  {
    key: "content",
    options: [
      { value: "todo", label: "Has todo", icon: "Task" },
      { value: "checklist", label: "Has checklist", icon: "checklist" },
      { value: "table", label: "Has table", icon: "table" },
      { value: "code", label: "Has code block", icon: "codeBlock" },
    ],
  },
  {
    key: "recency",
    options: [
      { value: "updated-today", label: "Updated today", icon: "Calendar" },
      { value: "updated-week", label: "Updated this week", icon: "Calendar" },
      { value: "updated-month", label: "Updated this month", icon: "Calendar" },
    ],
  },
  {
    key: "empty",
    options: [{ value: "empty", label: "Is empty", icon: "Notes" }],
  },
];

const NOTE_PREVIEW_LEN = { sm: 0, md: 140, lg: 280 };

function formatNoteDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfLocalWeek(d = new Date()) {
  const day = startOfLocalDay(d);
  const wd = day.getDay();
  day.setDate(day.getDate() - (wd === 0 ? 6 : wd - 1));
  return day;
}

function startOfLocalMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function noteUpdatedSince(note, since) {
  const t = new Date(note?.updatedAt || "").getTime();
  return !Number.isNaN(t) && t >= since.getTime();
}

function noteHasChecklist(body) {
  return String(body || "").includes('data-type="taskList"');
}

function noteHasOpenTodo(body) {
  const html = String(body || "");
  if (!noteHasChecklist(html) && !html.includes("taskItem")) return false;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll('li[data-type="taskItem"]')].some((li) => {
      const v = li.getAttribute("data-checked");
      return v !== "true" && v !== "";
    });
  } catch {
    return /data-checked="false"/.test(html);
  }
}

function noteHasTable(body) {
  return /<table[\s>]/i.test(String(body || ""));
}

function noteHasCodeBlock(body) {
  return /<pre[\s>]/i.test(String(body || ""));
}

function filterNotes(list, filter) {
  const notes = list || [];
  switch (filter) {
    case "todo":
      return notes.filter((n) => noteHasOpenTodo(n.body));
    case "checklist":
      return notes.filter((n) => noteHasChecklist(n.body));
    case "table":
      return notes.filter((n) => noteHasTable(n.body));
    case "code":
      return notes.filter((n) => noteHasCodeBlock(n.body));
    case "updated-today":
      return notes.filter((n) => noteUpdatedSince(n, startOfLocalDay()));
    case "updated-week":
      return notes.filter((n) => noteUpdatedSince(n, startOfLocalWeek()));
    case "updated-month":
      return notes.filter((n) => noteUpdatedSince(n, startOfLocalMonth()));
    case "empty":
      return notes.filter((n) => isEmptyNoteBody(n.body));
    case "all":
    default:
      return notes;
  }
}

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

/** Shared Move / Duplicate / Delete items for note menus. */
function NoteActionsItems({
  moveOptions = [],
  onMove,
  onDuplicate,
  onDelete,
  onRun,
}) {
  const leaveTimer = useRef(0);
  const [moveOpen, setMoveOpen] = useState(false);
  const canMove = moveOptions.length > 0;

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const run = (fn) => {
    setMoveOpen(false);
    onRun?.(fn);
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
    <>
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
        <Icon name="copy" size={14} />
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
    </>
  );
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
  const [pos, setPos] = useState({ left, top });

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
      <NoteActionsItems
        moveOptions={moveOptions}
        onMove={onMove}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onRun={(fn) => {
          onClose?.();
          fn?.();
        }}
      />
    </div>
  );
}

const NOTE_EXPORT_OPTS = [
  { value: "md", label: "Markdown", icon: "fileMd" },
  { value: "html", label: "HTML", icon: "fileHtml" },
  { value: "txt", label: "Plain text", icon: "fileTxt" },
];

const NOTE_COPY_OPTS = [
  { value: "md", label: "Markdown", icon: "fileMd" },
  { value: "rich", label: "Rich text", icon: "fileRich" },
  { value: "txt", label: "Plain text", icon: "fileTxt" },
];

/** Nested Export as… / Copy as… flyout row (same hover pattern as Move). */
function NoteShareFlyout({ label, icon, options, onPick }) {
  const leaveTimer = useRef(0);
  const [open, setOpen] = useState(false);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const show = () => {
    window.clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className={"notes-ctx-move" + (open ? " open" : "")}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        role="menuitem"
        className="notes-ctx-move-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          window.clearTimeout(leaveTimer.current);
          setOpen((o) => !o);
        }}
      >
        <Icon name={icon} size={14} />
        <span className="notes-ctx-move-lab">{label}</span>
        <span className="notes-ctx-move-caret" aria-hidden="true">
          <Icon name="arrow" size={12} />
        </span>
      </button>
      {open ? (
        <div className="pop notes-ctx-move-pop" role="menu" aria-label={label}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onPick?.(opt.value);
              }}
            >
              {opt.icon ? <Icon name={opt.icon} size={14} /> : null}
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Share — export/copy the selected note (before Organise). */
function NoteShareMenu({ disabled, body }) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  const runExport = (format) => {
    exportNoteAs(body, format);
    close();
  };

  const runCopy = async (format) => {
    close();
    try {
      const label = await copyNoteAs(body, format);
      showSnackbar({ icon: "check", message: `Copied as ${label}`, durationMs: 2500 });
    } catch {
      showSnackbar({
        icon: "alert",
        message: "Could not copy to clipboard",
        durationMs: 3000,
      });
    }
  };

  return (
    <div
      className={"notes-more" + (open ? " open" : "")}
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        ref={btnRef}
        className="mod-act"
        title="Share"
        aria-label="Share"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <Icon name="share" size={18} />
        <span className="mod-act-lab">Share</span>
      </button>
      {open && pos ? (
        <div
          className="pop dd-menu notes-ctx-menu"
          role="menu"
          aria-label="Share"
          style={{
            display: "block",
            top: pos.top,
            right: pos.right,
            left: "auto",
          }}
        >
          <NoteShareFlyout
            label="Export as…"
            icon="export"
            options={NOTE_EXPORT_OPTS}
            onPick={runExport}
          />
          <NoteShareFlyout
            label="Copy as…"
            icon="copy"
            options={NOTE_COPY_OPTS}
            onPick={runCopy}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Organise — Move / Duplicate / Delete (same actions as the list context menu). */
function NoteMoreMenu({
  disabled,
  moveOptions = [],
  onMove,
  onDuplicate,
  onDelete,
}) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div
      className={"notes-more" + (open ? " open" : "")}
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        ref={btnRef}
        className="mod-act"
        title="Organise"
        aria-label="Organise"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <Icon name="folders" size={18} />
        <span className="mod-act-lab">Organise</span>
      </button>
      {open && pos ? (
        <div
          className="pop dd-menu notes-ctx-menu"
          role="menu"
          aria-label="Organise"
          style={{
            display: "block",
            top: pos.top,
            right: pos.right,
            left: "auto",
          }}
        >
          <NoteActionsItems
            moveOptions={moveOptions}
            onMove={onMove}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onRun={(fn) => {
              setOpen(false);
              fn?.();
            }}
          />
        </div>
      ) : null}
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
  const d = mod[2] || { id: "", notes: [] };
  const [sort, setSort] = useState("updated-desc");
  const [cardSize, setCardSize] = useState("md");
  const [showCreated, setShowCreated] = useState(false);
  const [showUpdated, setShowUpdated] = useState(false);
  const [filter, setFilter] = useState("all");
  const notes = useMemo(
    () => sortNotes(filterNotes(d.notes, filter), sort),
    [d.notes, filter, sort]
  );
  const tabKey = notesTabKey(folder?.id, d.id);
  const [selectedByTab, setSelectedByTab] = useState(() => loadNotesSelected());
  const [unlocked, setUnlocked] = useState(() => loadNotesUnlocked());
  const [editor, setEditor] = useState(null);
  const [toolbarMounted, setToolbarMounted] = useState(false);
  const [toolbarIn, setToolbarIn] = useState(false);
  const [editingView, setEditingView] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const moveOptions = useMemo(() => {
    const currentKey = `${folder?.id || ""}/${d.id || ""}`;
    return allNotesTabs(folders)
      .filter((t) => t.key !== currentKey)
      .map((t) => ({
        value: t.key,
        label: t.label,
        color: t.color,
        folder: t.folder,
        mod: t.mod,
      }));
  }, [folders, folder?.id, d.id]);

  const rememberedId = (tabKey && selectedByTab[tabKey]) || null;
  const selectedId =
    rememberedId && notes.some((n) => n.id === rememberedId)
      ? rememberedId
      : notes[0]?.id || null;

  const setSelectedId = (id) => {
    if (!tabKey) return;
    const nextId = id || null;
    setSelectedByTab((prev) => {
      if ((prev[tabKey] || null) === nextId) return prev;
      const next = { ...prev };
      if (nextId) next[tabKey] = nextId;
      else delete next[tabKey];
      return next;
    });
    saveNotesSelected(tabKey, nextId);
  };

  const unlockKey = (noteId) =>
    noteUnlockKey(folder?.id, d.id, noteId);
  const locked = !selectedId || !unlocked[unlockKey(selectedId)];

  useEffect(() => {
    saveNotesUnlocked(unlocked);
  }, [unlocked]);

  const setNoteLocked = (noteId, next) => {
    if (!noteId) return;
    const key = unlockKey(noteId);
    if (!key) return;
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

  const setLocked = (next) => setNoteLocked(selectedId, next);

  const toggleNoteLock = (noteId) => {
    if (!noteId || readonly) return;
    const key = unlockKey(noteId);
    setNoteLocked(noteId, !!unlocked[key]);
  };

  // Drop remembered selection only when that note was deleted/moved away.
  useEffect(() => {
    if (!tabKey || !rememberedId) return;
    const all = Array.isArray(d.notes) ? d.notes : [];
    if (all.some((n) => n.id === rememberedId)) return;
    setSelectedId(notes[0]?.id || null);
  }, [tabKey, d.notes, rememberedId, notes]);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    let timeout = 0;
    if (!selectedId || locked) {
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
  }, [locked, selectedId, editor]);

  const selected = notes.find((n) => n.id === selectedId) || null;

  const imageUpload =
    selected && folder?.id && d.id && !readonly
      ? {
          scope: "note",
          project: folder.id,
          notesTab: d.id,
          note: selected.id,
          onApplyWorkspace,
        }
      : null;

  const saveBody = async (body) => {
    if (!selected || readonly) return;
    const data = await putNote({
      project: folder.id,
      notesTab: d.id,
      note: selected.id,
      title: noteListTitle(body),
      body,
    });
    onApplyWorkspace(data);
  };

  const addNote = async () => {
    if (readonly) return;
    const data = await postNote({
      project: folder.id,
      notesTab: d.id,
      title: "New note...",
      body: EMPTY_NOTE_BODY,
    });
    onApplyWorkspace(data);
    if (data.id) {
      setSelectedId(data.id);
      setUnlocked((prev) => ({ ...prev, [unlockKey(data.id)]: true }));
    }
  };

  const clearNoteUnlock = (noteId) => {
    const key = unlockKey(noteId);
    if (!key) return;
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
      project: folder.id,
      notesTab: d.id,
      note: note.id,
    });
    clearNoteUnlock(note.id);
    if (selectedId === note.id) setSelectedId(null);
    onApplyWorkspace(data);
  };

  const moveNote = async (dest, note = selected) => {
    if (!note || readonly || !dest?.folder || !dest?.mod) return;
    const toProject = dest.folder.id;
    const toNotesTab = dest.mod[2]?.id;
    if (!toProject || !toNotesTab) return;
    try {
      const data = await moveNoteApi({
        project: folder.id,
        notesTab: d.id,
        note: note.id,
        toProject,
        toNotesTab,
      });
      clearNoteUnlock(note.id);
      if (selectedId === note.id) setSelectedId(null);
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
      project: folder.id,
      notesTab: d.id,
      title,
      body: note.body || EMPTY_NOTE_BODY,
    });
    onApplyWorkspace(data);
    if (data.id) {
      setSelectedId(data.id);
      setUnlocked((prev) => ({ ...prev, [unlockKey(data.id)]: true }));
    }
  };

  const selectNote = (id) => {
    if (id === selectedId) return;
    setSelectedId(id);
  };

  const openNoteCtx = (e, note) => {
    if (readonly || !note) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(note.id);
    setCtxMenu({ left: e.clientX, top: e.clientY, note });
  };

  const openTabFolder = async () => {
    if (!folder?.id || !d.id) return;
    try {
      await revealTab({ project: folder.id, type: "notes", id: d.id });
    } catch (err) {
      window.alert(err.message || "Could not open folder");
    }
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
          <button
            type="button"
            className="mod-act"
            onClick={openTabFolder}
            title={folderAppLabel()}
            aria-label={`Open in ${folderAppLabel()}`}
          >
            <Icon name="folder" size={18} />
            <span className="mod-act-lab">{folderAppLabel()}</span>
          </button>
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
              {
                label: "Show",
                closeOnSelect: false,
                onChange: (key) => {
                  if (key === "created") setShowCreated((v) => !v);
                  else if (key === "updated") setShowUpdated((v) => !v);
                },
                options: NOTE_SHOW_OPTIONS.map((o) => ({
                  ...o,
                  checked: o.value === "created" ? showCreated : showUpdated,
                })),
                renderOption: (o) => (
                  <span className="dd-check">
                    <input type="checkbox" checked={!!o.checked} readOnly tabIndex={-1} />
                    {o.label}
                  </span>
                ),
              },
            ]}
          >
            <Icon name="eye" size={18} />
            <span className="mod-act-lab">View</span>
          </Dropdown>
          <Dropdown
            className="mod-view-dd"
            buttonClassName={"mod-act" + (filter !== "all" ? " on" : "")}
            ariaLabel="Filter notes"
            title="Filter notes"
            align="left"
            caret={false}
            sections={NOTE_FILTER_SECTIONS.map((sec) => ({
              ...sec,
              value: filter,
              onChange: setFilter,
            }))}
          >
            <Icon name="filter" size={18} />
            <span className="mod-act-lab">Filter</span>
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
        <div className="modbar-end">
          {selected ? (
            <NoteShareMenu disabled={!selected} body={selected.body} />
          ) : null}
          {selected && !readonly && (
            <>
              <NoteMoreMenu
                moveOptions={moveOptions}
                onMove={(dest) => moveNote(dest)}
                onDuplicate={() => duplicateNote(selected)}
                onDelete={() => deleteNote()}
              />
              {locked ? (
                <button
                  type="button"
                  className="mod-act"
                  onClick={() => setLocked(false)}
                  title="Unlock"
                  aria-label="Unlock"
                >
                  <Icon name="unlock" size={18} />
                  <span className="mod-act-lab">Unlock</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="mod-act on"
                  onClick={() => setLocked(true)}
                  title="Lock"
                  aria-label="Lock"
                >
                  <Icon name="lock" size={18} />
                  <span className="mod-act-lab">Lock</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="notes-layout">
        <aside className="notes-sidebar">
          {(d.notes || []).length === 0 ? (
            <p className="notes-empty">No notes yet</p>
          ) : notes.length === 0 ? (
            <p className="notes-empty">No matching notes</p>
          ) : (
            <div className={"notes-list size-" + cardSize}>
              {notes.map((n) => {
                const preview =
                  cardSize === "sm"
                    ? ""
                    : noteListPreview(n.body, NOTE_PREVIEW_LEN[cardSize] || 140);
                const isEditing = !!unlocked[unlockKey(n.id)];
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={"notes-item" + (n.id === selectedId ? " on" : "")}
                    onClick={() => selectNote(n.id)}
                    onDoubleClick={() => {
                      setSelectedId(n.id);
                      toggleNoteLock(n.id);
                    }}
                    onContextMenu={(e) => openNoteCtx(e, n)}
                  >
                    <span className={"notes-item-head" + (isEditing ? " editing" : "")}>
                      <span className="notes-item-edit" aria-hidden={!isEditing}>
                        <span className="notes-item-edit-clip">
                          <Icon name="unlock" size={12} />
                        </span>
                      </span>
                      <span className="notes-item-title">{noteListTitle(n.body)}</span>
                    </span>
                    {preview ? (
                      <span className="notes-item-preview">{preview}</span>
                    ) : null}
                    {showCreated ? (
                      <span className="notes-item-meta">
                        <Icon name="fieldDate" size={12} />
                        {formatNoteDate(n.createdAt)}
                      </span>
                    ) : null}
                    {showUpdated ? (
                      <span className="notes-item-meta">
                        <Icon name="stopwatch" size={12} />
                        {formatNoteDate(n.updatedAt)}
                      </span>
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
              {toolbarMounted ? (
                <div
                  className={"notes-rte-toolbar" + (toolbarIn ? " in" : "")}
                  aria-hidden={!toolbarIn}
                >
                  <div className="notes-rte-toolbar-clip">
                    <div className="notes-rte-toolbar-inner">
                      <RteToolbar
                        editor={editor}
                        variant="full"
                        hasRaisedIslands
                        imageUpload={imageUpload}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <RichTextEditor
                key={selected.id}
                value={selected.body || EMPTY_NOTE_BODY}
                onChange={saveBody}
                showLabel={false}
                showToolbar={false}
                variant="full"
                autofocus
                startInHeading
                imageUpload={imageUpload}
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
