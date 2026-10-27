import { useEffect, useMemo, useRef, useState } from "react";
import {
  postFile,
  putFile,
  deleteFileApi,
  moveFileApi,
} from "../api.js";
import { isPaywallAbortError } from "../billingLimits.js";
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
import SortHeader from "./SortHeader.jsx";

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

function filesTabSortKey(folderId, tabId) {
  return `${folderId || ""}/${tabId || ""}`;
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
    if (!cmp) cmp = String(a.id || "").localeCompare(String(b.id || ""));
    return cmp * dir;
  });
  return files;
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

function FileMoreMenu({
  disabled,
  moveTargets = [],
  onRename,
  onMove,
  onDelete,
}) {
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
  routeFileId = null,
  onFilePreview = null,
}) {
  const d = mod[2] || { id: "", files: [] };
  const files = d.files || [];
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [sorts, setSorts] = useState(() => loadFilesSorts());
  const tabSortKey = filesTabSortKey(folder?.id, d.id);
  const sort = sorts[tabSortKey] || DEFAULT_FILES_SORT;
  const sortedFiles = useMemo(() => sortFiles(files, sort), [files, sort]);
  const moveTargets = useMemo(() => {
    const currentKey = `${folder?.id || ""}/${d.id || ""}`;
    return allFilesTabs(folders).filter((t) => t.key !== currentKey);
  }, [folders, folder?.id, d.id]);

  const openPreview = (file) => {
    setPreview(file);
    if (onFilePreview) onFilePreview(file?.id || null);
  };
  const closePreview = () => {
    setPreview(null);
    if (onFilePreview) onFilePreview(null);
  };

  useEffect(() => {
    if (!routeFileId) {
      setPreview((prev) => (prev ? null : prev));
      return;
    }
    const hit = files.find((f) => f.id === routeFileId);
    if (hit) setPreview(hit);
    else setPreview(null);
  }, [routeFileId, files]);

  const keepNav = {
    keepNav: { project: folder.id, board: d.id, g: null },
  };

  const clearDragOver = () => {
    dragDepth.current = 0;
    setDragOver(false);
  };

  const toggleSort = (col) => {
    const next =
      sort.key === col
        ? { key: col, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key: col, dir: FILE_SORT_DEFAULT_DIR[col] || "asc" };
    setSorts((prev) => ({ ...prev, [tabSortKey]: next }));
    saveFilesSort(tabSortKey, next);
  };

  const uploadFiles = async (fileList) => {
    const list = Array.from(fileList || []).filter(Boolean);
    if (!list.length || readonly || busy) return;
    clearDragOver();
    setBusy(true);
    try {
      for (const file of list) {
        const data = await readFileAsBase64(file);
        const next = await postFile({
          project: folder.id,
          filesTab: d.id,
          name: file.name,
          mime: file.type || "application/octet-stream",
          data,
        });
        onApplyWorkspace(next, keepNav);
      }
    } catch (err) {
      if (!isPaywallAbortError(err)) {
        window.alert(err.message || "Could not upload file");
      }
    } finally {
      setBusy(false);
    }
  };

  const addFile = async (ev) => {
    const list = Array.from(ev.target.files || []);
    ev.target.value = "";
    await uploadFiles(list);
  };

  const isFileDrag = (ev) =>
    Array.from(ev.dataTransfer?.types || []).includes("Files");

  const onDragEnter = (ev) => {
    if (readonly || busy || !isFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragLeave = (ev) => {
    if (readonly || busy) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) clearDragOver();
  };

  const onDragOver = (ev) => {
    if (readonly || busy || !isFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "copy";
  };

  const onDrop = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragOver();
    if (readonly || busy) return;
    await uploadFiles(ev.dataTransfer?.files);
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
        project: folder.id,
        filesTab: d.id,
        file: file.id,
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
      message: "It will move to Trash and can be restored within 30 days.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = await deleteFileApi({
        project: folder.id,
        filesTab: d.id,
        file: file.id,
      });
      onApplyWorkspace(next, keepNav);
    } finally {
      setBusy(false);
    }
  };

  const moveFile = async (file, dest) => {
    if (readonly || busy || !file || !dest?.folder || !dest?.mod) return;
    const toProject = dest.folder.id;
    const toFilesTab = dest.mod[2]?.id;
    if (!toProject || !toFilesTab) return;
    setBusy(true);
    try {
      const next = await moveFileApi({
        project: folder.id,
        filesTab: d.id,
        file: file.id,
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
    <div
      id="view"
      className={"mod files-view" + (dragOver ? " is-dragover" : "")}
      style={{ ["--tab"]: tabC }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
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
          <input
            ref={inputRef}
            type="file"
            className="files-input"
            multiple
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
                  key={file.id}
                  className="files-row"
                  onClick={() => openPreview(file)}
                >
                  <FileTypeIcon name={file.name} mime={file.mime} size={22} />
                  <button
                    type="button"
                    className="files-name"
                    title={file.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      openPreview(file);
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
      {dragOver && !readonly ? (
        <div className="files-drop-overlay" aria-hidden="true">
          Drop files to add
        </div>
      ) : null}
      {preview ? (
        <FilePreviewDialog
          file={preview}
          files={sortedFiles}
          onFileChange={(file) => {
            setPreview(file);
            if (onFilePreview) onFilePreview(file?.id || null);
          }}
          project={folder.id}
          filesTab={d.id}
          onClose={closePreview}
        />
      ) : null}
    </div>
  );
}
