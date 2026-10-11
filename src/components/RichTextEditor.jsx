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
import { Icon } from "../icons.jsx";
import { askPrompt } from "../promptDialog.js";
import Dropdown from "./Dropdown.jsx";

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

  return createPortal(
    <div
      className="rte-table-float"
      style={{ top: coords.top, left: coords.left }}
      role="toolbar"
      aria-label="Table"
    >
      <ToolbarBtn
        title="Add row below"
        disabled={!editor.can().addRowAfter()}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          +
        </span>
        <Icon name="tableRow" size={15} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Add column after"
        disabled={!editor.can().addColumnAfter()}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          +
        </span>
        <Icon name="tableCol" size={15} />
      </ToolbarBtn>
      <span className="rte-table-float-sep" aria-hidden="true" />
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
        title="Delete column"
        disabled={!editor.can().deleteColumn()}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <span className="rte-table-float-act" aria-hidden="true">
          −
        </span>
        <Icon name="tableCol" size={15} />
      </ToolbarBtn>
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

export function RteToolbar({
  editor,
  forNotes = false,
  headingLevels = [],
  showTable = false,
  showQuote = false,
  showCodeBlock = false,
  showHelp = true,
  onDelete,
  moveOptions = [],
  onMove,
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
  const levels = forNotes
    ? [1, 2, 3, 4]
    : headingLevels.length
      ? headingLevels
      : [1];
  const tables = forNotes || showTable;
  const quotes = forNotes || showQuote;
  const codeBlocks = forNotes || showCodeBlock;
  const inTable = tables && editor.isActive("table");
  const canMove = typeof onMove === "function" && moveOptions.length > 0;
  return (
    <div className={"rte-toolbar" + (forNotes ? " notes-rte-toolbar" : "")}>
      {levels.length > 0 && (
        <div className="rte-group" role="group" aria-label="Blocks">
          {levels.map((level) => (
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
          {forNotes && (
            <ToolbarBtn
              title="Paragraph"
              active={editor.isActive("paragraph")}
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              <span className="rte-block-lab">P</span>
            </ToolbarBtn>
          )}
        </div>
      )}
      <div className="rte-group" role="group" aria-label="Text">
        <ToolbarBtn
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Icon name="bold" size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Link"
          active={editor.isActive("link")}
          onClick={() => editLink(editor)}
        >
          <Icon name="link" size={15} />
        </ToolbarBtn>
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
        {quotes && (
          <ToolbarBtn
            title="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Icon name="blockquote" size={15} />
          </ToolbarBtn>
        )}
        {codeBlocks && (
          <ToolbarBtn
            title="Code block"
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Icon name="codeBlock" size={15} />
          </ToolbarBtn>
        )}
        {forNotes && (
          <ToolbarBtn
            title="Highlight"
            active={editor.isActive("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Icon name="highlight" size={15} />
          </ToolbarBtn>
        )}
      </div>
      {tables && (
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
      {showHelp ? (
      <div className="rte-group" role="group" aria-label="Help">
        <span className="dlg-desc-info" tabIndex={0} aria-label="Help">
          <Icon name="About" size={15} />
          <div className="dlg-desc-tip" role="tooltip">
            <div>
              <b>Bold:</b> **text**
            </div>
            <div>
              <b>Italic:</b> _text_
            </div>
            <div>
              <b>Strikethrough:</b> ~~text~~
            </div>
            <div>
              <b>Heading:</b> # text
            </div>
            <div>
              <b>List:</b>
              <br />- Item 1
              <br />- Item 2
            </div>
            <div>
              <b>Numbered list:</b>
              <br />
              1. Item 1
              <br />
              2. Item 2
            </div>
            <div>
              <b>Checklist:</b>
              <br />
              [] Item 1
              <br />
              [x] Item 2
            </div>
            <div>
              <b>Inline code:</b> `text`
            </div>
            {codeBlocks && (
              <div>
                <b>Code block:</b>
                <br />
                ```
                <br />
                code
                <br />
                ```
              </div>
            )}
            {quotes && (
              <div>
                <b>Quote:</b> &gt; text
              </div>
            )}
          </div>
        </span>
      </div>
      ) : null}
      {(canMove || onDelete) && (
        <div className="rte-group" role="group" aria-label="Note actions">
          {canMove && (
            <Dropdown
              className="rte-move-dd"
              buttonClassName="rte-btn"
              ariaLabel="Move"
              dataTip="Move"
              align="right"
              caret={false}
              options={moveOptions}
              onChange={(_val, opt) => onMove(opt)}
              renderOption={(o) => (
                <>
                  <span
                    className="rte-move-dot"
                    style={{ background: o.color || "var(--acc)" }}
                  />
                  {o.label}
                </>
              )}
            >
              <Icon name="move" size={15} />
            </Dropdown>
          )}
          {onDelete && (
            <ToolbarBtn
              title="Delete"
              onClick={onDelete}
              className="rte-btn-danger"
            >
              <Icon name="Trash" size={15} />
            </ToolbarBtn>
          )}
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
  forNotes = false,
  headingLevels = [],
  showTable = false,
  showQuote = false,
  showCodeBlock = false,
  showHelp = true,
  onEditor,
}) {
  const levels = forNotes
    ? [1, 2, 3, 4]
    : headingLevels.length
      ? headingLevels
      : [1];
  const tables = forNotes || showTable;
  const quotes = forNotes || showQuote;
  const codeBlocks = forNotes || showCodeBlock;

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
        heading: { levels },
        codeBlock: codeBlocks ? undefined : false,
        blockquote: quotes ? undefined : false,
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
      ...(forNotes ? [Highlight] : []),
      ...(tables
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
              forNotes={forNotes}
              headingLevels={headingLevels}
              showTable={showTable}
              showQuote={showQuote}
              showCodeBlock={showCodeBlock}
              showHelp={showHelp}
            />
          </div>
        ) : (
          <div className="dlg-desc-head notes-rte-head">
            <RteToolbar
              editor={editor}
              forNotes={forNotes}
              headingLevels={headingLevels}
              showTable={showTable}
              showQuote={showQuote}
              showCodeBlock={showCodeBlock}
              showHelp={showHelp}
            />
          </div>
        ))}
      <EditorContent editor={editor} />
      {tables && editable ? <TableFloat editor={editor} /> : null}
    </div>
  );
}
