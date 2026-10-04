import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useState } from "react";
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

function ToolbarBtn({ onClick, active, title, disabled, children }) {
  return (
    <button
      type="button"
      className={"rte-btn" + (active ? " on" : "")}
      title={title}
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

export function RteToolbar({ editor, forNotes = false }) {
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
  const inTable = forNotes && editor.isActive("table");
  return (
    <div className={"rte-toolbar" + (forNotes ? " notes-rte-toolbar" : "")}>
      {forNotes && (
        <div className="rte-group" role="group" aria-label="Blocks">
          <ToolbarBtn
            title="Heading 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <span className="rte-block-lab">H1</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <span className="rte-block-lab">H2</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="Heading 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <span className="rte-block-lab">H3</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="Heading 4"
            active={editor.isActive("heading", { level: 4 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          >
            <span className="rte-block-lab">H4</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="Paragraph"
            active={editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <span className="rte-block-lab">P</span>
          </ToolbarBtn>
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
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <Icon name="list" size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <Icon name="checklist" size={15} />
        </ToolbarBtn>
        {forNotes && (
          <>
            <ToolbarBtn
              title="Blockquote"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Icon name="blockquote" size={15} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Code block"
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <Icon name="codeBlock" size={15} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Highlight"
              active={editor.isActive("highlight")}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
            >
              <Icon name="highlight" size={15} />
            </ToolbarBtn>
          </>
        )}
      </div>
      {forNotes && (
        <div className="rte-group" role="group" aria-label="Table">
          <ToolbarBtn
            title="Insert table"
            active={inTable}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <Icon name="table" size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Add column"
            disabled={!inTable}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            <Icon name="tableCol" size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Add row"
            disabled={!inTable}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            <Icon name="tableRow" size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Delete table"
            disabled={!inTable}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <Icon name="tableDelete" size={15} />
          </ToolbarBtn>
        </div>
      )}
      <div className="rte-group" role="group" aria-label="Help">
        <span className="dlg-desc-info" tabIndex={0} aria-label="Formatting help">
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
            {forNotes && (
              <>
                <div>
                  <b>Code block:</b>
                  <br />
                  ```
                  <br />
                  code
                  <br />
                  ```
                </div>
                <div>
                  <b>Quote:</b> &gt; text
                </div>
              </>
            )}
          </div>
        </span>
      </div>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  showLabel = true,
  showToolbar = true,
  editable = true,
  autofocus = false,
  startInHeading = false,
  forNotes = false,
  onEditor,
}) {
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
        heading: { levels: forNotes ? [1, 2, 3, 4] : [1] },
        codeBlock: forNotes ? undefined : false,
        blockquote: forNotes ? undefined : false,
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
      ...(forNotes
        ? [
            Highlight,
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
            <span className="dlg-desc-label">Description</span>
            <RteToolbar editor={editor} forNotes={forNotes} />
          </div>
        ) : (
          <div className="dlg-desc-head notes-rte-head">
            <RteToolbar editor={editor} forNotes={forNotes} />
          </div>
        ))}
      <EditorContent editor={editor} />
    </div>
  );
}
