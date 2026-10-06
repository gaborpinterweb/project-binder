import { useEffect, useRef, useState } from "react";
import { postFile, putFile, deleteFileApi, fileDownloadUrl } from "../api.js";
import { Icon } from "../icons.jsx";
import { askConfirm } from "../confirmDialog.js";
import { askPrompt } from "../promptDialog.js";

const FILE_COLUMNS = [
  { id: "size", label: "File size" },
  { id: "added", label: "Date added" },
];

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDateAdded(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

function FilesColumnsDropdown({ visible, onChange }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const activeCount = FILE_COLUMNS.filter((c) => visible[c.id]).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={"db-cols-dd" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className={"mod-act" + (open || activeCount > 0 ? " on" : "")}
        aria-label="Columns"
        title="Columns"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="tableCol" size={18} />
        <span className="mod-act-lab">Columns</span>
      </button>
      {open ? (
        <div className="pop db-cols-menu" role="dialog" aria-label="Visible columns">
          <div className="db-cols-list">
            {FILE_COLUMNS.map((col) => (
              <label key={col.id} className="db-cols-item">
                <input
                  type="checkbox"
                  checked={!!visible[col.id]}
                  onChange={() =>
                    onChange({ ...visible, [col.id]: !visible[col.id] })
                  }
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FileMoreMenu({ disabled, onRename, onDelete }) {
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
    const onReposition = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

  return (
    <div className={"files-more" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="files-more-btn"
        title="File options"
        aria-label="File options"
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
        <Icon name="more" size={14} />
      </button>
      {open && pos ? (
        <div
          className="pop"
          role="menu"
          style={{ top: pos.top, right: pos.right, left: "auto" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              run(onRename);
            }}
          >
            <Icon name="pencil" size={14} />
            Rename
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
      ) : null}
    </div>
  );
}

export default function Files({ mod, folder, tabC, readonly, onApplyWorkspace }) {
  const d = mod[2] || { slug: "", files: [] };
  const files = d.files || [];
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState({ size: false, added: false });
  const showSize = !!cols.size;
  const showAdded = !!cols.added;

  const keepNav = {
    keepNav: { project: folder.slug, board: d.slug, g: null },
  };

  const addFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file || readonly || busy) return;
    setBusy(true);
    try {
      const data = await readFileAsBase64(file);
      const next = await postFile({
        project: folder.slug,
        filesTab: d.slug,
        name: file.name,
        mime: file.type || "application/octet-stream",
        data,
      });
      onApplyWorkspace(next, keepNav);
    } catch (err) {
      window.alert(err.message || "Could not upload file");
    } finally {
      setBusy(false);
    }
  };

  const renameFile = async (file) => {
    if (readonly || busy) return;
    const nextName = await askPrompt({
      title: "Rename file",
      defaultValue: file.name,
      confirmLabel: "Rename",
    });
    if (nextName == null) return;
    const name = nextName.trim();
    if (!name || name === file.name) return;
    setBusy(true);
    try {
      const next = await putFile({
        project: folder.slug,
        filesTab: d.slug,
        file: file.slug,
        name,
      });
      onApplyWorkspace(next, keepNav);
    } catch (err) {
      window.alert(err.message || "Could not rename file");
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (file) => {
    if (readonly || busy) return;
    const ok = await askConfirm({
      title: `Delete "${file.name}"?`,
      message: "This permanently removes the file.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = await deleteFileApi({
        project: folder.slug,
        filesTab: d.slug,
        file: file.slug,
      });
      onApplyWorkspace(next, keepNav);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="view" className="mod files-view" style={{ ["--tab"]: tabC }}>
      <div className="modbar">
        <div className="modbar-start">
          {!readonly && (
            <button
              type="button"
              className="mod-act"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              title="Add file"
              aria-label="Add file"
            >
              <Icon name="plus" size={18} />
              <span className="mod-act-lab">Add file</span>
            </button>
          )}
          <FilesColumnsDropdown visible={cols} onChange={setCols} />
          <input
            ref={inputRef}
            type="file"
            className="files-input"
            onChange={addFile}
            disabled={readonly || busy}
          />
        </div>
      </div>
      <div className="files-body">
        {files.length === 0 ? (
          <div className="files-empty">No files yet.</div>
        ) : (
          <div className="files-table">
            {(showSize || showAdded) && (
              <div className="files-head" aria-hidden="true">
                <span className="files-head-name">Name</span>
                {showSize && <span className="files-col-size">Size</span>}
                {showAdded && <span className="files-col-added">Date added</span>}
                <span className="files-head-more" />
              </div>
            )}
            <ul className="files-list">
              {files.map((file) => (
                <li key={file.slug} className="files-row">
                  <Icon name="Files" size={22} />
                  <a
                    className="files-name"
                    href={fileDownloadUrl(folder.slug, d.slug, file.slug)}
                    target="_blank"
                    rel="noreferrer"
                    title={file.name}
                  >
                    {file.name}
                  </a>
                  {showSize && (
                    <span className="files-col-size">{formatFileSize(file.size)}</span>
                  )}
                  {showAdded && (
                    <span className="files-col-added">
                      {formatDateAdded(file.createdAt)}
                    </span>
                  )}
                  {!readonly ? (
                    <FileMoreMenu
                      disabled={busy}
                      onRename={() => renameFile(file)}
                      onDelete={() => removeFile(file)}
                    />
                  ) : (
                    <span className="files-more-spacer" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
