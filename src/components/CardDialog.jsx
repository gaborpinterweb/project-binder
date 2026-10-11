import { useEffect, useRef, useState } from "react";
import {
  cardFileDownloadUrl,
  deleteCardFileApi,
  fetchCardTimelogs,
  postCardFile,
} from "../api.js";
import { Icon } from "../icons.jsx";
import {
  PC,
  allBoards,
  boardColumnLabel,
  boardLabel,
  formatDuration,
  isDone,
  isEmptyNoteBody,
  pastel,
  playTaskCompleteSound,
  taskKey,
} from "../utils.js";
import { fieldTypeIcon } from "../dbFields.js";
import DbFieldInput from "./DbFieldInput.jsx";
import CardTitleIcons from "./CardTitleIcons.jsx";
import FilePreviewDialog from "./FilePreviewDialog.jsx";
import FileTypeIcon from "./FileTypeIcon.jsx";
import PropDropdown, { closePropDrops } from "./PropDropdown.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import TimelogDropdown, {
  TimelogMenuButtons,
  runTimelogAction,
  timelogOptions,
} from "./TimelogDropdown.jsx";
import { askConfirm } from "../confirmDialog.js";

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

function formatCardTimelogDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function CardMoreMenu({ onDuplicate, onDelete }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

  return (
    <div className={"card-dlg-more" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className="card-dlg-more-btn"
        title="Card options"
        aria-label="Card options"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="more" size={16} />
      </button>
      {open ? (
        <div className="pop" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onDuplicate)}
          >
            <Icon name="copy" size={14} />
            Duplicate task
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => run(onDelete)}
          >
            <Icon name="Trash" size={14} />
            Delete task
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CardAddChip({
  canAddDescription,
  canAddPriority,
  canTimelog,
  canAddFile,
  showTimers,
  folder,
  mod,
  row,
  onAddDescription,
  onAddPriority,
  onAddFile,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
  onAfterTimelogAction,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const options = timelogOptions({ showTimers });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!canAddDescription && !canAddPriority && !canTimelog && !canAddFile)
    return null;

  return (
    <div
      className={"prop-chip card-add-chip" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className="prop-dd-btn"
        title="Add to card"
        aria-label="Add to card"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="lab">+</span>
      </button>
      {open ? (
        <div className="pop card-add-menu" role="menu">
          {canAddDescription ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onAddDescription?.();
              }}
            >
              <span className="dd-opt">
                <Icon name="Notes" size={14} />
                Description
              </span>
            </button>
          ) : null}
          {canAddPriority ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onAddPriority?.();
              }}
            >
              <span className="dd-opt">
                <Icon name="priority" size={14} />
                Priority
              </span>
            </button>
          ) : null}
          {canAddFile ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onAddFile?.();
              }}
            >
              <span className="dd-opt">
                <Icon name="Files" size={14} />
                File
              </span>
            </button>
          ) : null}
          {canTimelog ? (
            <div className="card-add-sub">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="card-add-sub-trigger"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="dd-opt">
                  <Icon name="Timelogs" size={14} />
                  Timelogs
                </span>
                <Icon name="arrow" size={12} />
              </button>
              <div className="pop card-add-sub-menu" role="menu">
                <TimelogMenuButtons
                  options={options}
                  onPick={async (v) => {
                    setOpen(false);
                    await runTimelogAction(v, {
                      folder,
                      mod,
                      row,
                      onStartPomo,
                      onAddManualTimelog,
                      onOpenTimelogs,
                    });
                    await onAfterTimelogAction?.(v);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function CardDialog({
  row,
  isDraft,
  loc,
  folders,
  stages,
  g,
  readonly = false,
  onClose,
  onPersist,
  onCreate,
  onDelete,
  onDuplicate,
  onStartPomo,
  onAddManualTimelog,
  onEditTimelog,
  onOpenTimelogs,
  onMoveCard,
  onSaveItem,
  onApplyWorkspace,
  keepNav,
  showMasterColumn = true,
  showTimelogs = true,
  activeTimerKey = null,
}) {
  const [curLoc, setCurLoc] = useState(
    isDraft && loc
      ? { folder: loc.folder, mod: loc.mod }
      : loc
        ? { folder: loc.folder, mod: loc.mod }
        : null
  );
  const [originLoc, setOriginLoc] = useState(loc);
  const [draft, setDraft] = useState(() => ({
    ...row,
    files: Array.isArray(row?.files) ? row.files.map((f) => ({ ...f })) : [],
  }));
  const [showDescription, setShowDescription] = useState(
    () => !isEmptyNoteBody(row?.body)
  );
  const [spent, setSpent] = useState(0);
  const [cardLogs, setCardLogs] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const fileDragDepth = useRef(0);
  const persistTimer = useRef(null);
  const draftRef = useRef(draft);
  const curLocRef = useRef(curLoc);
  const originLocRef = useRef(originLoc);
  const confirmingRef = useRef(false);
  draftRef.current = draft;
  curLocRef.current = curLoc;
  originLocRef.current = originLoc;
  confirmingRef.current = confirming;

  const isDb = !isDraft && originLoc?.mod?.[0] === "Database";
  const timerActive =
    !isDraft &&
    !!activeTimerKey &&
    !!curLoc?.folder?.slug &&
    !!curLoc?.mod?.[2]?.slug &&
    !!draft?.slug &&
    taskKey(curLoc.folder.slug, curLoc.mod[2].slug, draft.slug) ===
      activeTimerKey;

  const reloadCardLogs = async () => {
    const cur = curLocRef.current;
    const slug = draftRef.current?.slug;
    if (isDraft || !cur || cur.mod[0] !== "Board" || !slug) {
      setCardLogs([]);
      setSpent(0);
      return;
    }
    const entries = await fetchCardTimelogs(
      cur.folder.slug,
      cur.mod[2].slug,
      slug
    );
    setCardLogs(entries);
    setSpent(entries.reduce((sum, e) => sum + (e.durationSec || 0), 0));
  };

  useEffect(() => {
    if (isDraft || !curLoc || curLoc.mod[0] !== "Board" || !draft.slug) {
      setCardLogs([]);
      setSpent(0);
      return;
    }
    let cancelled = false;
    fetchCardTimelogs(curLoc.folder.slug, curLoc.mod[2].slug, draft.slug).then(
      (entries) => {
        if (cancelled) return;
        setCardLogs(entries);
        setSpent(
          entries.reduce((sum, e) => sum + (e.durationSec || 0), 0)
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [isDraft, curLoc, draft.slug]);

  useEffect(() => {
    const esc = (e) => {
      if (e.key !== "Escape") return;
      if (confirmingRef.current) return;
      close(false);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tintStyle = (() => {
    if (isDb || !curLoc) return {};
    const pc = curLoc.folder.color || PC[0];
    return { ["--pc"]: pc, background: pastel(pc) };
  })();

  const persist = async () => {
    if (readonly || isDraft || !curLocRef.current) return;
    const r = draftRef.current;
    const cur = curLocRef.current;
    const origin = originLocRef.current;
    if (cur.mod[0] === "Board") {
      if (
        origin &&
        (origin.folder.slug !== cur.folder.slug ||
          origin.mod[2].slug !== cur.mod[2].slug)
      ) {
        await onMoveCard(r, origin, cur);
        setOriginLoc(cur);
        originLocRef.current = cur;
      } else {
        await onPersist(r, cur.folder, cur.mod);
      }
    } else if (cur.mod[0] === "Database") {
      await onSaveItem(r, cur.folder, cur.mod);
    }
  };

  const persistSoon = () => {
    if (readonly || isDraft) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persist();
    }, 300);
  };

  const patch = (partial) => {
    setDraft((d) => {
      const next = { ...d, ...partial };
      draftRef.current = next;
      return next;
    });
    persistSoon();
  };

  const close = async (create) => {
    clearTimeout(persistTimer.current);
    if (readonly) {
      onClose({});
      return;
    }
    if (isDraft) {
      if (create) {
        if (!curLoc || curLoc.mod[0] !== "Board") return;
        if (!(draft.n || "").trim()) {
          alert("Add a task title first.");
          return;
        }
        await onCreate(draft, curLoc);
      } else {
        onClose({ draftRemember: draft, loc: curLoc });
        return;
      }
      onClose({ created: true });
      return;
    }
    await persist();
    onClose({});
  };

  const boards = allBoards(folders);
  const canTimelogCard =
    !isDraft && curLoc?.mod[0] === "Board" && !!draft.slug;
  const showTimelogSection = canTimelogCard && cardLogs.length > 0;
  const canAddFile =
    !readonly &&
    !!curLoc?.folder?.slug &&
    curLoc?.mod?.[0] === "Board" &&
    !!draft.slug;
  const cardFiles = Array.isArray(draft.files) ? draft.files : [];

  const setDraftFiles = (files) => {
    setDraft((d) => {
      const next = { ...d, files };
      draftRef.current = next;
      return next;
    });
  };

  const uploadCardFiles = async (fileList) => {
    const list = Array.from(fileList || []).filter(Boolean);
    if (!list.length || !canAddFile || fileBusy) return;
    setFileBusy(true);
    try {
      let files = cardFiles;
      for (const file of list) {
        const data = await readFileAsBase64(file);
        const res = await postCardFile({
          project: curLoc.folder.slug,
          board: curLoc.mod[2].slug,
          card: draft.slug,
          name: file.name,
          mime: file.type || "application/octet-stream",
          data,
        });
        files = res.files || [];
        setDraftFiles(files);
        onApplyWorkspace?.(res, keepNav?.(curLoc.folder.slug, curLoc.mod[2].slug));
      }
    } catch (err) {
      window.alert(err.message || "Could not upload file");
    } finally {
      setFileBusy(false);
    }
  };

  const removeCardFile = async (file) => {
    if (!canAddFile || !file?.slug || fileBusy) return;
    setConfirming(true);
    const ok = await askConfirm({
      title: `Delete "${file.name || "file"}"?`,
      message: "This permanently deletes the file from the card.",
      confirmLabel: "Delete",
      danger: true,
    });
    setConfirming(false);
    if (!ok) return;
    setFileBusy(true);
    try {
      const res = await deleteCardFileApi({
        project: curLoc.folder.slug,
        board: curLoc.mod[2].slug,
        card: draft.slug,
        file: file.slug,
      });
      setDraftFiles(res.files || []);
      onApplyWorkspace?.(res, keepNav?.(curLoc.folder.slug, curLoc.mod[2].slug));
    } catch (err) {
      window.alert(err.message || "Could not delete file");
    } finally {
      setFileBusy(false);
    }
  };

  const clearFileDrag = () => {
    fileDragDepth.current = 0;
    setFileDragOver(false);
  };

  const isFileDrag = (ev) =>
    Array.from(ev.dataTransfer?.types || []).includes("Files");

  const onFileDragEnter = (ev) => {
    if (!canAddFile || fileBusy || confirming || !isFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    fileDragDepth.current += 1;
    setFileDragOver(true);
  };

  const onFileDragLeave = (ev) => {
    if (!canAddFile || fileBusy || confirming) return;
    ev.preventDefault();
    ev.stopPropagation();
    fileDragDepth.current -= 1;
    if (fileDragDepth.current <= 0) clearFileDrag();
  };

  const onFileDragOver = (ev) => {
    if (!canAddFile || fileBusy || confirming || !isFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "copy";
  };

  const onFileDrop = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearFileDrag();
    if (!canAddFile || fileBusy || confirming) return;
    await uploadCardFiles(ev.dataTransfer?.files);
  };

  return (
    <>
    <div
      className={"ov ov-top" + (confirming ? " is-confirm-hidden" : "")}
      aria-hidden={confirming || undefined}
      onMouseDown={(e) => {
        if (confirming) return;
        if (e.target === e.currentTarget) close(false);
        else if (!e.target.closest?.(".prop-dd")) closePropDrops();
      }}
    >
      <div
        className={
          "dlg" +
          (curLoc && !isDb ? " tint" : "") +
          (fileDragOver ? " is-file-dragover" : "")
        }
        style={tintStyle}
        onDragEnter={onFileDragEnter}
        onDragLeave={onFileDragLeave}
        onDragOver={onFileDragOver}
        onDrop={onFileDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="files-input"
          multiple
          disabled={!canAddFile || fileBusy}
          onChange={async (ev) => {
            const list = Array.from(ev.target.files || []);
            ev.target.value = "";
            await uploadCardFiles(list);
          }}
        />
        <div className="dlg-content">
          {isDb ? null : (
            <div className="title-row">
              <input
                type="checkbox"
                className="card-check"
                checked={isDone(draft)}
                disabled={readonly}
                title={
                  readonly
                    ? undefined
                    : isDone(draft)
                      ? "Mark active"
                      : "Mark completed"
                }
                onChange={(e) => {
                  if (readonly) return;
                  const doneAt = e.target.checked
                    ? new Date().toISOString()
                    : "";
                  if (e.target.checked) playTaskCompleteSound();
                  patch({ doneAt });
                  clearTimeout(persistTimer.current);
                  draftRef.current = { ...draftRef.current, doneAt };
                  persist();
                }}
              />
              <input
                className={"title" + (isDone(draft) ? " done" : "")}
                value={draft.n || ""}
                placeholder="Untitled"
                autoFocus={!readonly}
                readOnly={readonly}
                onChange={(e) => {
                  if (readonly) return;
                  patch({ n: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (readonly || e.key !== "Enter") return;
                  e.preventDefault();
                  close(isDraft);
                }}
              />
              <CardTitleIcons
                priority={!!draft.priority}
                files={draft.files}
                timerActive={timerActive}
              />
              {!readonly &&
                !isDraft &&
                curLoc?.mod[0] === "Board" &&
                draft.slug && (
                  <CardMoreMenu
                    onDuplicate={async () => {
                      clearTimeout(persistTimer.current);
                      await persist();
                      await onDuplicate(draft, curLoc);
                    }}
                    onDelete={async () => {
                      const label = (draft.n || "").trim() || "Untitled";
                      const ok = await askConfirm({
                        title: `Delete "${label}"?`,
                        confirmLabel: "Delete",
                        danger: true,
                      });
                      if (!ok) return;
                      clearTimeout(persistTimer.current);
                      await onDelete(curLoc.folder, curLoc.mod, draft.slug);
                      onClose({ deleted: true });
                    }}
                  />
                )}
            </div>
          )}
          {isDb ? (
            <DbFields
              row={draft}
              loc={originLoc || curLoc}
              stages={stages}
              readonly={readonly}
              onPatch={patch}
              onPersist={persist}
            />
          ) : (
            <>
              <div className="dlg-fields">
                <div className="prop-chips">
                  {readonly ? (
                    <span className="prop-chip prop-chip-ro">
                      <span
                        className="dot"
                        style={{
                          background: curLoc?.folder.color || PC[0],
                        }}
                      />
                      <span className="lab">
                        {boardColumnLabel(
                          curLoc?.folder,
                          curLoc?.mod,
                          draft.s
                        )}
                      </span>
                    </span>
                  ) : (
                    <PropDropdown
                      className="prop-chip"
                      sections={boards.map(({ folder, mod, key }) => {
                        const cols = mod[2]?.columns || stages;
                        const isCurrent =
                          curLoc &&
                          curLoc.folder.slug === folder.slug &&
                          curLoc.mod[2].slug === mod[2].slug;
                        return {
                          key,
                          label: boardLabel(folder, mod),
                          value: isCurrent ? draft.s || "" : "",
                          options: cols.map((col) => ({
                            value: col,
                            label: col,
                            folder,
                            mod,
                            column: col,
                          })),
                          onChange: (_v, o) => {
                            const next = { folder: o.folder, mod: o.mod };
                            setCurLoc(next);
                            curLocRef.current = next;
                            setDraft((d) => {
                              const nextDraft = { ...d, s: o.column };
                              draftRef.current = nextDraft;
                              return nextDraft;
                            });
                            clearTimeout(persistTimer.current);
                            persist();
                          },
                          renderOption: (o) => (
                            <>
                              <span
                                className="dot"
                                style={{
                                  background: o.folder.color || PC[0],
                                }}
                              />
                              {o.label}
                            </>
                          ),
                        };
                      })}
                    >
                      <span
                        className="dot"
                        style={{
                          background: curLoc?.folder.color || PC[0],
                        }}
                      />
                      <span className="lab">
                        {boardColumnLabel(
                          curLoc?.folder,
                          curLoc?.mod,
                          draft.s
                        )}
                      </span>
                    </PropDropdown>
                  )}
                  {showMasterColumn &&
                    (readonly ? (
                      <span
                        className="prop-chip prop-chip-ro"
                        title="Master board"
                      >
                        <Icon name="Masterboard" size={12} />
                        <span className="lab">{draft.ms || stages[0]}</span>
                      </span>
                    ) : (
                      <PropDropdown
                        className="prop-chip"
                        title="Master board"
                        sections={[
                          {
                            key: "master",
                            label: "Master board",
                            value: draft.ms || stages[0],
                            options: stages,
                            onChange: (o) => {
                              patch({ ms: o });
                              clearTimeout(persistTimer.current);
                              draftRef.current = {
                                ...draftRef.current,
                                ms: o,
                              };
                              persist();
                            },
                          },
                        ]}
                      >
                        <Icon name="Masterboard" size={12} />
                        <span className="lab">{draft.ms || ""}</span>
                      </PropDropdown>
                    ))}
                  {draft.priority ? (
                    <div className="prop-chip card-file-chip">
                      <span className="card-file-chip-lab">
                        <Icon name="priority" size={14} />
                        <span className="lab">Priority</span>
                      </span>
                      {!readonly ? (
                        <button
                          type="button"
                          className="card-file-chip-del"
                          title="Remove priority"
                          aria-label="Remove priority"
                          onClick={(e) => {
                            e.stopPropagation();
                            patch({ priority: false });
                            clearTimeout(persistTimer.current);
                            draftRef.current = {
                              ...draftRef.current,
                              priority: false,
                            };
                            persist();
                          }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {cardFiles.map((file) => (
                    <div key={file.slug} className="prop-chip card-file-chip">
                      <button
                        type="button"
                        className="card-file-chip-open"
                        title={file.name}
                        onClick={() => setPreviewFile(file)}
                      >
                        <FileTypeIcon name={file.name} mime={file.mime} size={14} />
                        <span className="lab">{file.name}</span>
                      </button>
                      {!readonly ? (
                        <button
                          type="button"
                          className="card-file-chip-del"
                          title="Delete file"
                          aria-label={`Delete ${file.name}`}
                          disabled={fileBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCardFile(file);
                          }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!readonly ? (
                    <CardAddChip
                      canAddDescription={!showDescription}
                      canAddPriority={!draft.priority}
                      canAddFile={canAddFile}
                      canTimelog={canTimelogCard && !showTimelogSection}
                      showTimers={showTimelogs}
                      folder={curLoc?.folder}
                      mod={curLoc?.mod}
                      row={draft}
                      onAddDescription={() => setShowDescription(true)}
                      onAddPriority={() => {
                        patch({ priority: true });
                        clearTimeout(persistTimer.current);
                        draftRef.current = {
                          ...draftRef.current,
                          priority: true,
                        };
                        persist();
                      }}
                      onAddFile={() => fileInputRef.current?.click()}
                      onStartPomo={onStartPomo}
                      onAddManualTimelog={onAddManualTimelog}
                      onOpenTimelogs={onOpenTimelogs}
                      onAfterTimelogAction={async (v) => {
                        if (v === "pomo" || v === "stoptimer") return;
                        if (v === "manual") {
                          await reloadCardLogs();
                          return;
                        }
                        await close(false);
                      }}
                    />
                  ) : null}
                </div>
              </div>
              {showDescription ? (
                <div className="dlg-description">
                  <RichTextEditor
                    value={draft.body || ""}
                    placeholder="Write something…"
                    editable={!readonly}
                    showToolbar={!readonly}
                    onChange={(html) => {
                      if (readonly) return;
                      patch({ body: html });
                    }}
                  />
                </div>
              ) : null}
              {showTimelogSection ? (
                <section className="dlg-timelogs">
                  <div className="dlg-desc-head">
                    <span className="dlg-desc-label">Timelogs</span>
                    <span className="dlg-timelog-total">
                      {formatDuration(spent)}
                    </span>
                    {!readonly ? (
                      <TimelogDropdown
                        className="dlg-timelog-more"
                        buttonClassName="dlg-timelog-more-btn"
                        align="right"
                        caret={false}
                        folder={curLoc.folder}
                        mod={curLoc.mod}
                        row={draft}
                        showTimers={showTimelogs}
                        onStartPomo={onStartPomo}
                        onAddManualTimelog={onAddManualTimelog}
                        onOpenTimelogs={onOpenTimelogs}
                        ariaLabel="Timelog actions"
                        title="Timelog actions"
                        onAfterAction={async (v) => {
                          if (v === "pomo" || v === "stoptimer") return;
                          if (v === "manual") {
                            await reloadCardLogs();
                            return;
                          }
                          await close(false);
                        }}
                      >
                        <Icon name="more" size={16} />
                      </TimelogDropdown>
                    ) : null}
                  </div>
                  <ul className="dlg-timelog-list">
                    {cardLogs.map((entry) => {
                      const stamp = entry.endedAt || entry.startedAt || "";
                      return (
                        <li key={entry.slug} className="dlg-timelog-item">
                          <span
                            className={
                              "dlg-timelog-note" +
                              (entry.note ? "" : " is-empty")
                            }
                          >
                            {entry.note || "No notes…"}
                          </span>
                          <time
                            className="dlg-timelog-date"
                            dateTime={stamp}
                          >
                            {formatCardTimelogDate(stamp)}
                          </time>
                          <span className="dlg-timelog-dur">
                            {formatDuration(entry.durationSec)}
                          </span>
                          {!readonly ? (
                            <button
                              type="button"
                              className="dlg-timelog-edit-btn"
                              title="Edit timelog"
                              aria-label="Edit timelog"
                              onClick={async () => {
                                await onEditTimelog?.(entry);
                                await reloadCardLogs();
                              }}
                            >
                              <Icon name="pencil" size={14} />
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
        {!readonly && isDraft ? (
          <div className="dlg-controls">
            <div className="actions">
              <button
                type="button"
                className="dlg-create"
                onClick={() => close(true)}
              >
                Add task
              </button>
            </div>
          </div>
        ) : null}
        {fileDragOver && canAddFile ? (
          <div className="card-file-drop-overlay" aria-hidden="true">
            Drop file to add…
          </div>
        ) : null}
      </div>
    </div>
    {previewFile && curLoc?.folder?.slug && curLoc?.mod?.[2]?.slug && draft.slug ? (
      <FilePreviewDialog
        file={previewFile}
        project={curLoc.folder.slug}
        board={curLoc.mod[2].slug}
        card={draft.slug}
        downloadUrl={cardFileDownloadUrl(
          curLoc.folder.slug,
          curLoc.mod[2].slug,
          draft.slug,
          previewFile.slug
        )}
        onClose={() => setPreviewFile(null)}
      />
    ) : null}
    </>
  );
}

function DbFields({ row, loc, stages, readonly, onPatch, onPersist }) {
  const cols = loc?.mod?.[2]?.cols || [];
  const firstEditable = cols.find((c) => c.type !== "longtext") || cols[0];

  if (!cols.length) return null;

  return (
    <div className="dlg-fields">
      <table className="props">
        <tbody>
          {cols.map((c) => (
            <tr
              key={c.id}
              className={c.type === "longtext" ? "db-prop-rich" : undefined}
            >
              <td>
                <span className="db-prop-lab">
                  <Icon name={fieldTypeIcon(c.type)} size={14} />
                  {c.label}
                  {c.required ? <span className="db-req">*</span> : null}
                </span>
              </td>
              <td>
                {c.type === "longtext" ? (
                  <RichTextEditor
                    value={row[c.id] || ""}
                    showLabel={false}
                    placeholder="Write something…"
                    editable={!readonly}
                    showToolbar={!readonly}
                    onChange={(html) => {
                      if (readonly) return;
                      onPatch({ [c.id]: html });
                    }}
                  />
                ) : (
                  <DbFieldInput
                    col={c}
                    value={row[c.id]}
                    stages={stages}
                    variant="prop"
                    autoFocus={!readonly && c.id === firstEditable?.id}
                    placeholder={c.id === "n" ? "New entry" : ""}
                    onChange={(next) => onPatch({ [c.id]: next })}
                    onCommit={() => onPersist()}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
