import { useEditor, EditorContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
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
import { postRteImage, rteImageUrl } from "../api.js";
import { Icon } from "../icons.jsx";
import { askPrompt } from "../promptDialog.js";

const RTE_IMAGE_MAX_W = 400;

/** Keep resize chrome sized to the img and pin the handle to its bottom-right corner. */
function syncRteImageBox(img) {
  if (!(img instanceof HTMLElement)) return;
  const wrapper = img.closest("[data-resize-wrapper]");
  const container = img.closest("[data-resize-container]");
  if (!wrapper || !container) return;
  // Once TipTap assigns an explicit size, drop the default max-width cap so
  // proportional resize isn't clipped (width stuck, height grows).
  if (img.style.width || img.getAttribute("width")) {
    img.style.maxWidth = "";
  }
  const w = Math.round(img.offsetWidth || img.getBoundingClientRect().width);
  const h = Math.round(img.offsetHeight || img.getBoundingClientRect().height);
  if (!(w > 0) || !(h > 0)) return;
  // Block (not flex/inline-flex) so vertical margins collapse like locked preview <img>s.
  container.style.setProperty("display", "block", "important");
  container.style.setProperty("width", `${w}px`, "important");
  container.style.setProperty("max-width", "100%", "important");
  wrapper.style.setProperty("width", `${w}px`, "important");
  wrapper.style.setProperty("height", `${h}px`, "important");
  const handle = wrapper.querySelector("[data-resize-handle]");
  if (handle instanceof HTMLElement) {
    // Center on the image corner (Bear-style), not on a stretched wrapper edge.
    const cornerX = img.offsetLeft + w;
    const cornerY = img.offsetTop + h;
    handle.style.setProperty("top", `${cornerY}px`, "important");
    handle.style.setProperty("left", `${cornerX}px`, "important");
    handle.style.setProperty("right", "auto", "important");
    handle.style.setProperty("bottom", "auto", "important");
    handle.style.setProperty("transform", "translate(-50%, -50%)", "important");
  }
}

/** TipTap Image + resize, with box sync so the handle stays on the image corner. */
const RteImage = Image.extend({
  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props) => {
      const view = parent(props);
      if (!view?.dom) return view;
      const img =
        view.dom.querySelector?.("img") ||
        (view.dom instanceof HTMLImageElement ? view.dom : null);
      if (!img) return view;

      const sync = () => syncRteImageBox(img);
      const ro =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
      ro?.observe(img);
      img.addEventListener("load", sync);
      // Default cap before first explicit resize.
      if (!img.style.width && !img.getAttribute("width")) {
        img.style.maxWidth = `${RTE_IMAGE_MAX_W}px`;
      }
      sync();
      requestAnimationFrame(sync);

      const origDestroy = view.destroy?.bind(view);
      view.destroy = () => {
        ro?.disconnect();
        img.removeEventListener("load", sync);
        origDestroy?.();
      };
      return view;
    };
  },
});

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || "").toLowerCase().startsWith("image/")) return true;
  const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"].includes(ext);
}

function imageFilesFromList(list) {
  return Array.from(list || []).filter(isImageFile);
}

async function uploadRteImageFile(imageUpload, file) {
  if (!imageUpload?.project || !imageUpload?.scope || !file) {
    throw new Error("Missing upload context");
  }
  const data = await readFileAsBase64(file);
  const body = {
    scope: imageUpload.scope,
    project: imageUpload.project,
    name: file.name || "image",
    mime: file.type || "application/octet-stream",
    data,
  };
  if (imageUpload.scope === "note") {
    body.notesTab = imageUpload.notesTab;
    body.note = imageUpload.note;
  }
  const res = await postRteImage(body);
  const fileId = res.file?.id || res.id;
  if (!fileId) throw new Error("Upload failed");
  const src = rteImageUrl({
    scope: imageUpload.scope,
    project: imageUpload.project,
    notesTab: imageUpload.notesTab,
    note: imageUpload.note,
    file: fileId,
  });
  return { src, res };
}

/** Block images can't sit inside headings/paragraphs — place after the top-level block when needed. */
function insertRteImage(editor, src) {
  if (!editor || editor.isDestroyed || !src) return false;
  if (editor.can().setImage({ src })) {
    return editor.chain().focus().setImage({ src }).run();
  }
  const { $from } = editor.state.selection;
  const pos = $from.after(1);
  return editor
    .chain()
    .focus()
    .insertContentAt(pos, { type: "image", attrs: { src } })
    .run();
}

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
    image: full,
  };
}

export function RteToolbar({
  editor,
  variant = "mini",
  hasRaisedIslands = false,
  imageUpload = null,
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

  const fileRef = useRef(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageBusyRef = useRef(false);

  const insertImageFiles = useCallback(
    async (files) => {
      if (!editor || editor.isDestroyed || !imageUpload || imageBusyRef.current) return;
      const list = imageFilesFromList(files);
      if (!list.length) return;
      imageBusyRef.current = true;
      setImageBusy(true);
      try {
        for (const file of list) {
          const { src, res } = await uploadRteImageFile(imageUpload, file);
          if (editor.isDestroyed) return;
          const ok = insertRteImage(editor, src);
          if (!ok) throw new Error("Could not insert image");
          imageUpload.onApplyWorkspace?.(res);
        }
      } catch (err) {
        window.alert(err.message || "Could not upload image");
      } finally {
        imageBusyRef.current = false;
        setImageBusy(false);
      }
    },
    [editor, imageUpload]
  );

  if (!editor) return null;
  const feat = rteFeatures(variant);
  const inTable = feat.table && editor.isActive("table");
  const canImage = feat.image && !!imageUpload;
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
      {(feat.table || canImage) && (
        <div className="rte-group" role="group" aria-label="Insert">
          {feat.table && (
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
          )}
          {canImage && (
            <>
              <ToolbarBtn
                title="Insert image"
                disabled={imageBusy}
                active={editor.isActive("image")}
                onClick={() => fileRef.current?.click()}
              >
                <Icon name="image" size={15} />
              </ToolbarBtn>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  // Snapshot before clearing — input FileList is live and empties on reset.
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  void insertImageFiles(files);
                }}
              />
            </>
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
  variant = "mini",
  hasRaisedIslands = false,
  imageUpload = null,
  onEditor,
}) {
  const feat = rteFeatures(variant);
  const imageUploadRef = useRef(imageUpload);
  imageUploadRef.current = imageUpload;
  const uploadBusyRef = useRef(false);
  const editorRef = useRef(null);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  const initialContent = (() => {
    const html = toEditorContent(value);
    if (startInHeading || autofocus) {
      if (isBlankHeadingHtml(html)) return emptyHeadingDoc();
    }
    return html || "";
  })();

  const insertUploadedImages = useCallback(async (ed, files) => {
    const ctx = imageUploadRef.current;
    if (!ed || ed.isDestroyed || !ctx || uploadBusyRef.current) return false;
    const list = imageFilesFromList(files);
    if (!list.length) return false;
    uploadBusyRef.current = true;
    try {
      for (const file of list) {
        const { src, res } = await uploadRteImageFile(ctx, file);
        if (ed.isDestroyed) return true;
        const ok = insertRteImage(ed, src);
        if (!ok) throw new Error("Could not insert image");
        ctx.onApplyWorkspace?.(res);
      }
    } catch (err) {
      window.alert(err.message || "Could not upload image");
    } finally {
      uploadBusyRef.current = false;
    }
    return true;
  }, []);

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
      ...(feat.image
        ? [
            RteImage.configure({
              inline: false,
              allowBase64: false,
              HTMLAttributes: { class: "rte-image" },
              // TipTap attaches handles on mount and only strips them when
              // editable flips; keep resize off entirely for read-only views.
              resize: editable
                ? {
                    enabled: true,
                    directions: ["bottom-right"],
                    alwaysPreserveAspectRatio: true,
                    minWidth: 48,
                    minHeight: 48,
                  }
                : false,
            }),
          ]
        : []),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "rte-content",
      },
      handlePaste: (_view, event) => {
        if (!feat.image || !imageUploadRef.current || !editableRef.current) return false;
        const files = imageFilesFromList(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        void insertUploadedImages(editorRef.current, files);
        return true;
      },
      handleDrop: (_view, event) => {
        if (!feat.image || !imageUploadRef.current || !editableRef.current) return false;
        const files = imageFilesFromList(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        void insertUploadedImages(editorRef.current, files);
        return true;
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
    editorRef.current = editor || null;
  }, [editor]);

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
              imageUpload={imageUpload}
            />
          </div>
        ) : (
          <div className="dlg-desc-head notes-rte-head">
            <RteToolbar
              editor={editor}
              variant={variant}
              hasRaisedIslands={hasRaisedIslands}
              imageUpload={imageUpload}
            />
          </div>
        ))}
      <EditorContent editor={editor} />
      {feat.table && editable ? <TableFloat editor={editor} /> : null}
    </div>
  );
}
