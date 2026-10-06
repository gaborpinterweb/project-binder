import { useEffect, useMemo, useRef, useState } from "react";
import { postFile, putFile, deleteFileApi, moveFileApi, revealFilesTab } from "../api.js";
import { Icon } from "../icons.jsx";
import {
  allFilesTabs,
  DEFAULT_FILES_SORT,
  loadFilesSorts,
  saveFilesSort,
} from "../utils.js";
import { askConfirm } from "../confirmDialog.js";
import { askPrompt } from "../promptDialog.js";
import FilePreviewDialog from "./FilePreviewDialog.jsx";
import FileTypeIcon, { fileKindLabel } from "./FileTypeIcon.jsx";

function folderAppLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/mac/i.test(platform)) return "Finder";
  if (/win/i.test(platform)) return "File Explorer";
  return "Folder";
}

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

const FILE_SORT_DEFAULT_DIR = { name: "asc", type: "asc", size: "asc", added: "desc" };

function filesTabSortKey(folderSlug, tabSlug) {
  return `${folderSlug || ""}/${tabSlug || ""}`;
}

function sortFiles(list, sort) {
  const files = [...(list || [])];
  const dir = sort?.dir === "asc" ? 1 : -1;
  const key = sort?.key || "added";
  files.sort((a, b) => {
    let cmp = 0;
    if (key === "name") {
      cmp = String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    } else if (key === "type") {
      cmp = fileKindLabel(a.name, a.mime).localeCompare(
        fileKindLabel(b.name, b.mime),
        undefined,
        { sensitivity: "base" },
      );
    } else if (key === "size") {
      cmp = (Number(a.size) || 0) - (Number(b.size) || 0);
    } else {
      cmp = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    }
    if (!cmp) cmp = String(a.slug || "").localeCompare(String(b.slug || ""));
    return cmp * dir;
  });
  return files;
}

function SortHeader({ col, label, sort, onSort }) {
  const active = sort.key === col;
  return (
    <button
      type="button"
      className={"files-sort" + (active ? " on" : "")}
      onClick={() => onSort(col)}
      aria-label={
        active
          ? `${label}, sorted ${sort.dir === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`
      }
    >
      {label}
      {active ? (
        <span
          className={"files-sort-caret" + (sort.dir === "asc" ? " up" : "")}
          aria-hidden="true"
        >
          <Icon name="caret" size={12} />
        </span>
      ) : null}
    </button>
  );
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

function FileMoreMenu({ disabled, moveTargets = [], onRename, onMove, onDelete }) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const leaveTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const canMove = moveTargets.length > 0;

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) {
      setMoveOpen(false);
      return;
    }
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

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const run = (fn) => {
    setOpen(false);
    setMoveOpen(false);
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
      className={"files-more" + (open ? " open" : "")}
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
    >
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
          <div
            className={"files-move" + (moveOpen ? " open" : "")}
            onMouseEnter={showMove}
            onMouseLeave={hideMove}
          >
            <button
              type="button"
              role="menuitem"
              className="files-move-btn"
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
              <span className="files-move-lab">Move</span>
              <span className="files-move-caret" aria-hidden="true">
                <Icon name="arrow" size={12} />
              </span>
            </button>
            {moveOpen && canMove ? (
              <div className="pop files-move-pop" role="menu" aria-label="Move to tab">
                {moveTargets.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      run(() => onMove?.(t));
                    }}
                  >
                    <span
                      className="files-move-dot"
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

export default function Files({
  mod,
  folder,
  folders = [],
  tabC,
  readonly,
  onApplyWorkspace,
}) {
  const d = mod[2] || { slug: "", files: [] };
  const files = d.files || [];
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [sorts, setSorts] = useState(() => loadFilesSorts());
  const tabSortKey = filesTabSortKey(folder?.slug, d.slug);
  const sort = sorts[tabSortKey] || DEFAULT_FILES_SORT;
  const sortedFiles = useMemo(() => sortFiles(files, sort), [files, sort]);
  const moveTargets = useMemo(() => {
    const currentKey = `${folder?.slug || ""}/${d.slug || ""}`;
    return allFilesTabs(folders).filter((t) => t.key !== currentKey);
  }, [folders, folder?.slug, d.slug]);

  const keepNav = {
    keepNav: { project: folder.slug, board: d.slug, g: null },
  };

  const toggleSort = (col) => {
    const next =
      sort.key === col
        ? { key: col, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key: col, dir: FILE_SORT_DEFAULT_DIR[col] || "asc" };
    setSorts((prev) => ({ ...prev, [tabSortKey]: next }));
    saveFilesSort(tabSortKey, next);
  };

  const openFolder = async () => {
    try {
      await revealFilesTab({ project: folder.slug, filesTab: d.slug });
    } catch (err) {
      window.alert(err.message || "Could not open the folder");
    }
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

  const moveFile = async (file, dest) => {
    if (readonly || busy || !file || !dest?.folder || !dest?.mod) return;
    const toProject = dest.folder.slug;
    const toFilesTab = dest.mod[2]?.slug;
    if (!toProject || !toFilesTab) return;
    setBusy(true);
    try {
      const next = await moveFileApi({
        project: folder.slug,
        filesTab: d.slug,
        file: file.slug,
        toProject,
        toFilesTab,
      });
      onApplyWorkspace(next, {
        keepNav: { project: toProject, board: toFilesTab, g: null },
      });
    } catch (err) {
      window.alert(err.message || "Could not move file");
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
          <button
            type="button"
            className="mod-act"
            onClick={openFolder}
            title={folderAppLabel()}
            aria-label={`Open in ${folderAppLabel()}`}
          >
            <Icon name="folder" size={18} />
            <span className="mod-act-lab">{folderAppLabel()}</span>
          </button>
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
            <div className="files-head">
              <span className="files-head-icon" />
              <span className="files-head-name">
                <SortHeader col="name" label="Name" sort={sort} onSort={toggleSort} />
              </span>
              <span className="files-col-type">
                <SortHeader col="type" label="Type" sort={sort} onSort={toggleSort} />
              </span>
              <span className="files-col-size">
                <SortHeader col="size" label="Size" sort={sort} onSort={toggleSort} />
              </span>
              <span className="files-col-added">
                <SortHeader
                  col="added"
                  label="Date added"
                  sort={sort}
                  onSort={toggleSort}
                />
              </span>
              <span className="files-head-more" />
            </div>
            <ul className="files-list">
              {sortedFiles.map((file) => (
                <li
                  key={file.slug}
                  className="files-row"
                  onClick={() => setPreview(file)}
                >
                  <FileTypeIcon name={file.name} mime={file.mime} size={22} />
                  <button
                    type="button"
                    className="files-name"
                    title={file.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview(file);
                    }}
                  >
                    {file.name}
                  </button>
                  <span className="files-col-type">
                    {fileKindLabel(file.name, file.mime)}
                  </span>
                  <span className="files-col-size">{formatFileSize(file.size)}</span>
                  <span className="files-col-added">
                    {formatDateAdded(file.createdAt)}
                  </span>
                  {!readonly ? (
                    <FileMoreMenu
                      disabled={busy}
                      moveTargets={moveTargets}
                      onRename={() => renameFile(file)}
                      onMove={(dest) => moveFile(file, dest)}
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
      {preview ? (
        <FilePreviewDialog
          file={preview}
          project={folder.slug}
          filesTab={d.slug}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
