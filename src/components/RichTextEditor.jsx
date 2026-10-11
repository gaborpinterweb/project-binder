import { useEditor, EditorContent } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import {
  columnIsHeader,
  isInTable,
  rowIsHeader,
  selectedRect,
} from "@tiptap/pm/tables";
import { Icon } from "../icons.jsx";
import { askPrompt } from "../promptDialog.js";

/** First-row / first-column header flags for the table under the caret. */
function tableHeaderFlags(editor) {
  if (!editor || editor.isDestroyed || !isInTable(editor.state)) {
    return { row: false, col: false };
  }
  try {
    const rect = selectedRect(editor.state);
    return {
      row: rowIsHeader(rect.map, rect.table, 0),
      col: columnIsHeader(rect.map, rect.table, 0),
    };
  } catch {
    return { row: false, col: false };
  }
}

function toEditorContent(body) {
  if (!body) return "";
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function emptyHeadingDoc() {
  return {
    type: "doc",
    content: [{ type: "heading", attrs: { level: 1 }, content: [] }],
  };
}

function isBlankHeadingHtml(html) {
  const s = String(html || "").trim();
  return !s || s === "<h1></h1>" || s === "<h1><br></h1>" || s === "<h1><br/></h1>";
}

function normalizeHref(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(s)) return s;
  return "https://" + s;
}

async function editLink(editor) {
  const prev = editor.getAttributes("link").href || "";
  const next = await askPrompt({
    title: prev ? "Edit link" : "Add link",
    defaultValue: prev,
    placeholder: "https://",
    confirmLabel: prev ? "Save" : "Add",
  });
  if (next == null) return;
  const href = normalizeHref(next);
  if (!href) {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

function ToolbarBtn({ onClick, active, title, disabled, className, children }) {
  return (
    <button
      type="button"
      className={
        "rte-btn" +
        (active ? " on" : "") +
        (className ? " " + className : "")
      }
      data-tip={title || undefined}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function tableDomFromSelection(editor) {
  const { state, view } = editor;
  const $from = state.selection.$anchor;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") {
      const dom = view.nodeDOM($from.before(d));
      return dom instanceof HTMLElement ? dom : null;
    }
  }
  return null;
}

/** Floating table ops — fixed overlay, no in-flow spacing on the table. */
function TableFloat({ editor }) {
  const [coords, setCoords] = useState(null);
  const [, bump] = useState(0);

  const sync = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable || !editor.isActive("table")) {
      setCoords(null);
      return;
    }
    const tableEl = tableDomFromSelection(editor);
    if (!tableEl) {
      setCoords(null);
      return;
    }
    const rect = tableEl.getBoundingClientRect();
    const viewRect = editor.view.dom.getBoundingClientRect();
    if (
      rect.width < 1 ||
      rect.height < 1 ||
      rect.bottom < viewRect.top ||
      rect.top > viewRect.bottom
    ) {
      setCoords(null);
      return;
    }
    const floatH = 34;
    const gap = 8;
    let top = rect.top - floatH - gap;
    if (top < gap) top = Math.min(rect.top + gap, window.innerHeight - floatH - gap);
    setCoords({
      top,
      left: rect.left + rect.width / 2,
    });
    bump((n) => n + 1);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => sync();
    editor.on("selectionUpdate", onUpdate);
    editor.on("transaction", onUpdate);
    const dom = editor.view.dom;
    dom.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    window.addEventListener("scroll", onUpdate, true);
    sync();
    return () => {
      editor.off("selectionUpdate", onUpdate);
      editor.off("transaction", onUpdate);
      dom.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
      window.removeEventListener("scroll", onUpdate, true);
    };
  }, [editor, sync]);

  if (!coords || typeof document === "undefined") return null;

  const headers = tableHeaderFlags(editor);

  return createPortal(
    <div
      className="rte-table-float"
      style={{ top: coords.top, left: coords.left }}
      role="toolbar"
      aria-label="Table"
    >
      <ToolbarBtn
        title="Add row"
        disabled={!editor.can().addRowAfter()}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          +
        </span>
        <Icon name="tableRow" size={15} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Delete row"
        disabled={!editor.can().deleteRow()}
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          −
        </span>
        <Icon name="tableRow" size={15} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Add column"
        disabled={!editor.can().addColumnAfter()}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          +
        </span>
        <Icon name="tableCol" size={15} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Delete column"
        disabled={!editor.can().deleteColumn()}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          −
        </span>
        <Icon name="tableCol" size={15} />
      </ToolbarBtn>
      <span className="rte-table-float-sep" aria-hidden="true" />
      <ToolbarBtn
        title="Header row"
        active={headers.row}
        disabled={!editor.can().toggleHeaderRow()}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        <Icon name="tableHeaderRow" size={15} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Header column"
        active={headers.col}
        disabled={!editor.can().toggleHeaderColumn()}
        onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
      >
        <Icon name="tableHeaderCol" size={15} />
      </ToolbarBtn>
      <span className="rte-table-float-sep" aria-hidden="true" />
      <ToolbarBtn
        title="Delete table"
        disabled={!editor.can().deleteTable()}
        onClick={() => editor.chain().focus().deleteTable().run()}
        className="rte-btn-danger"
      >
        <Icon name="tableDelete" size={15} />
      </ToolbarBtn>
    </div>,
    document.body,
  );
}

/** mini: card/DB · full: notes/project cover */
function rteFeatures(variant = "mini") {
  const full = variant === "full";
  return {
    full,
    levels: full ? [1, 2, 3, 4] : [1, 2],
    paragraph: true,
    quote: full,
    codeBlock: true,
    highlight: full,
    table: full,
  };
}

export function RteToolbar({
  editor,
  variant = "mini",
  hasRaisedIslands = false,
}) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const update = () => bump((n) => n + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!editor) return null;
  const feat = rteFeatures(variant);
  const inTable = feat.table && editor.isActive("table");
  return (
    <div
      className={
        "rte-toolbar" +
        (feat.full ? " rte-toolbar-full" : " rte-toolbar-mini") +
        (hasRaisedIslands ? " rte-toolbar-raised" : "")
      }
    >
      {feat.full && (
        <div className="rte-group" role="group" aria-label="History">
          <ToolbarBtn
            title="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Icon name="undo" size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Icon name="redo" size={15} />
          </ToolbarBtn>
        </div>
      )}
      <div className="rte-group" role="group" aria-label="Headings">
        {feat.levels.map((level) => (
          <ToolbarBtn
            key={level}
            title={`Heading ${level}`}
            active={editor.isActive("heading", { level })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level }).run()
            }
          >
            <span className="rte-block-lab">{`H${level}`}</span>
          </ToolbarBtn>
        ))}
        {feat.paragraph && (
          <ToolbarBtn
            title="Paragraph"
            active={editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <span className="rte-block-lab">P</span>
          </ToolbarBtn>
        )}
      </div>
      <div className="rte-group" role="group" aria-label="Text">
        <ToolbarBtn
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Icon name="bold" size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Icon name="italic" size={15} />
        </ToolbarBtn>
        {feat.highlight && (
          <ToolbarBtn
            title="Highlight"
            active={editor.isActive("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Icon name="highlight" size={15} />
          </ToolbarBtn>
        )}
        <ToolbarBtn
          title="Link"
          active={editor.isActive("link")}
          onClick={() => editLink(editor)}
        >
          <Icon name="link" size={15} />
        </ToolbarBtn>
      </div>
      <div className="rte-group" role="group" aria-label="Lists">
        <ToolbarBtn
          title="List"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <Icon name="list" size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <Icon name="listOrdered" size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <Icon name="checklist" size={15} />
        </ToolbarBtn>
      </div>
      {(feat.quote || feat.codeBlock) && (
        <div className="rte-group" role="group" aria-label="Blocks">
          {feat.quote && (
            <ToolbarBtn
              title="Quote"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Icon name="blockquote" size={15} />
            </ToolbarBtn>
          )}
          {feat.codeBlock && (
            <ToolbarBtn
              title="Code block"
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <Icon name="codeBlock" size={15} />
            </ToolbarBtn>
          )}
        </div>
      )}
      {feat.table && (
        <div className="rte-group" role="group" aria-label="Table">
          <ToolbarBtn
            title="Insert table"
            active={inTable}
            onClick={() => {
              if (inTable) return;
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run();
            }}
          >
            <Icon name="table" size={15} />
          </ToolbarBtn>
        </div>
      )}
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  label = "Description",
  showLabel = true,
  showToolbar = true,
  editable = true,
  autofocus = false,
  startInHeading = false,
  variant = "mini",
  hasRaisedIslands = false,
  onEditor,
}) {
  const feat = rteFeatures(variant);

  const initialContent = (() => {
    const html = toEditorContent(value);
    if (startInHeading || autofocus) {
      if (isBlankHeadingHtml(html)) return emptyHeadingDoc();
    }
    return html || "";
  })();

  const editor = useEditor({
    editable,
    autofocus: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: feat.levels },
        codeBlock: feat.codeBlock ? undefined : false,
        blockquote: feat.quote ? undefined : false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || "Description...",
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      ...(feat.highlight ? [Highlight] : []),
      ...(feat.table
        ? [
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
          ]
        : []),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "rte-content",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!editable) return;
      if (ed.isEmpty) {
        onChange(startInHeading ? "<h1></h1>" : "");
        return;
      }
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    onEditor?.(editor || null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  // useEditor ignores later `editable` option changes (preserves isEditable).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isEditable === editable) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !autofocus) return;
    // Keep caret inside the first block (heading), not a trailing empty paragraph.
    const { state } = editor;
    const first = state.doc.firstChild;
    if (first) {
      const pos = 1; // inside first textblock
      editor.chain().setTextSelection(pos).focus().run();
    } else {
      editor.chain().focus().setHeading({ level: 1 }).run();
    }
  }, [editor, autofocus]);

  if (!editor) return null;

  return (
    <div className="rte">
      {showToolbar &&
        (showLabel ? (
          <div className="dlg-desc-head">
            <span className="dlg-desc-label">{label}</span>
            <RteToolbar
              editor={editor}
              variant={variant}
              hasRaisedIslands={hasRaisedIslands}
            />
          </div>
        ) : (
          <div className="dlg-desc-head notes-rte-head">
            <RteToolbar
              editor={editor}
              variant={variant}
              hasRaisedIslands={hasRaisedIslands}
            />
          </div>
        ))}
      <EditorContent editor={editor} />
      {feat.table && editable ? <TableFloat editor={editor} /> : null}
    </div>
  );
}
