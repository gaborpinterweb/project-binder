import { useEffect, useMemo, useState } from "react";
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
  const [search, setSearch] = useState("");
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
    if (locked) setEditor(null);
  }, [locked]);

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

  const deleteNote = async () => {
    if (!selected || readonly) return;
    const title = noteListTitle(selected.body) || "this note";
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
      note: selected.slug,
    });
    const key = unlockKey(selected.slug);
    setUnlocked((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setSelectedSlug(null);
    onApplyWorkspace(data);
  };

  const moveNote = async (dest) => {
    if (!selected || readonly || !dest?.folder || !dest?.mod) return;
    const toProject = dest.folder.slug;
    const toNotesTab = dest.mod[2]?.slug;
    if (!toProject || !toNotesTab) return;
    try {
      const data = await moveNoteApi({
        project: folder.slug,
        notesTab: d.slug,
        note: selected.slug,
        toProject,
        toNotesTab,
      });
      const key = unlockKey(selected.slug);
      setUnlocked((prev) => {
        if (!prev[key]) return prev;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      setSelectedSlug(null);
      onApplyWorkspace(data, {
        keepNav: { project: toProject, board: toNotesTab, g: null },
      });
    } catch (err) {
      alert(err?.message || "Could not move note.");
    }
  };

  const selectNote = (slug) => {
    if (slug === selectedSlug) return;
    setSelectedSlug(slug);
  };

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const title = noteListTitle(n.body).toLowerCase();
      const preview = noteListPreview(n.body, 280).toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [notes, search]);

  if (notes.length === 0) {
    return (
      <div id="view" className="mod notes-view" style={{ ["--tab"]: tabC }}>
        <div className="empty">
          <h2>No notes yet</h2>
          <p>Create your first note to start writing.</p>
          {!readonly && (
            <button type="button" className="cta" onClick={addNote}>
              New note
            </button>
          )}
        </div>
      </div>
    );
  }

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
              { label: "Sort", value: sort, onChange: setSort, options: NOTE_SORT_OPTIONS },
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
        </div>
        <div className="notes-toolbar-mid">
          {selected && !locked && (
            <RteToolbar
              editor={editor}
              forNotes
              moveOptions={readonly ? [] : moveOptions}
              onMove={readonly ? undefined : moveNote}
              onDelete={readonly ? undefined : deleteNote}
            />
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
          <div className="notes-sidebar-tools">
            <input
              className="notes-search"
              type="search"
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notes"
            />
          </div>
          <div className={"notes-list size-" + cardSize}>
            {filteredNotes.map((n) => {
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
                >
                  <span className="notes-item-title">{noteListTitle(n.body)}</span>
                  {preview ? (
                    <span className="notes-item-preview">{preview}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>
        <div className="notes-main">
          {!selected ? (
            <p className="notes-placeholder">Select or create a note</p>
          ) : locked ? (
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
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
