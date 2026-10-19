import { useEffect, useRef, useState } from "react";
import {
  cardFileDownloadUrl,
  deleteCardFileApi,
  deleteTimelogApi,
  fetchCardTimelogs,
  postCardFile,
} from "../api.js";
import { Icon } from "../icons.jsx";
import {
  EFFORT_LEVELS,
  IMPACT_LEVELS,
  normalizeEffort,
  normalizeImpact,
} from "../cardMeta.js";
import {
  PC,
  allBoards,
  boardColumnLabel,
  boardLabel,
  MIN_TIMELOG_SEC,
  formatDuration,
  formatTimer,
  isDone,
  isEmptyNoteBody,
  isStoptimerSession,
  pastel,
  playTaskCompleteSound,
  pomoElapsedSec,
  pomoRemainingSec,
  taskKey,
} from "../utils.js";
import { fieldTypeIcon } from "../dbFields.js";
import {
  normalizeCustomViews,
  normalizeHiddenCols,
  resolveCustomViewId,
  visibleDbCols,
} from "../dbViews.js";
import DbFieldInput from "./DbFieldInput.jsx";
import {
  CardMetaIcon,
  CardMetaKindIcon,
  CardMetaPicker,
} from "./CardTitleIcons.jsx";
import FilePreviewDialog from "./FilePreviewDialog.jsx";
import FileTypeIcon from "./FileTypeIcon.jsx";
import PropDropdown, { closePropDrops } from "./PropDropdown.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import TimelogDropdown, {
  TimelogMenuButtons,
  TimelogMoreMenu,
  runTimelogAction,
  timelogOptions,
} from "./TimelogDropdown.jsx";
import { askConfirm } from "../confirmDialog.js";
import { DbOrganiseMenu } from "./DbRecordMenu.jsx";

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

function fitTitleArea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function TitleArea({ className, value, onChange, onKeyDown, onBlur, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    fitTitleArea(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        fitTitleArea(e.currentTarget);
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      {...rest}
    />
  );
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
  canAddImpact,
  canAddEffort,
  canTimelog,
  canAddFile,
  showTimers,
  folder,
  mod,
  row,
  onAddDescription,
  onAddImpact,
  onAddEffort,
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

  if (
    !canAddDescription &&
    !canAddImpact &&
    !canAddEffort &&
    !canTimelog &&
    !canAddFile
  )
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
          {canAddEffort ? (
            <div className="card-add-sub">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="card-add-sub-trigger"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="dd-opt">
                  <CardMetaKindIcon kind="effort" size={18} />
                  Effort
                </span>
                <Icon name="arrow" size={12} />
              </button>
              <div className="pop card-add-sub-menu" role="menu">
                {EFFORT_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      onAddEffort?.(level);
                    }}
                  >
                    <span className="dd-opt">
                      <CardMetaIcon
                        kind="effort"
                        level={level}
                        size={18}
                        decorative
                      />
                      {level}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {canAddImpact ? (
            <div className="card-add-sub">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="card-add-sub-trigger"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="dd-opt">
                  <CardMetaKindIcon kind="impact" size={18} />
                  Impact
                </span>
                <Icon name="arrow" size={12} />
              </button>
              <div className="pop card-add-sub-menu" role="menu">
                {IMPACT_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      onAddImpact?.(level);
                    }}
                  >
                    <span className="dd-opt">
                      <CardMetaIcon
                        kind="impact"
                        level={level}
                        size={18}
                        decorative
                      />
                      {level}
                    </span>
                  </button>
                ))}
              </div>
            </div>
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
  onStopPomo,
  onStopActiveTimerForCard,
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
  activePomo = null,
  logsRefreshKey = 0,
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
    images: Array.isArray(row?.images) ? row.images.map((f) => ({ ...f })) : [],
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
    !!curLoc?.folder?.id &&
    !!curLoc?.mod?.[2]?.id &&
    !!draft?.id &&
    taskKey(curLoc.folder.id, curLoc.mod[2].id, draft.id) ===
      activeTimerKey;
  const [, setTimerTick] = useState(0);
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setTimerTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timerActive]);
  const liveElapsed =
    timerActive && activePomo ? pomoElapsedSec(activePomo) : 0;
  const liveCanSave = liveElapsed >= MIN_TIMELOG_SEC;
  const liveTimerLabel =
    timerActive && activePomo
      ? formatTimer(
          isStoptimerSession(activePomo)
            ? liveElapsed
            : pomoRemainingSec(activePomo)
        )
      : "";

  const reloadCardLogs = async () => {
    const cur = curLocRef.current;
    const id = draftRef.current?.id;
    if (isDraft || !cur || cur.mod[0] !== "Board" || !id) {
      setCardLogs([]);
      setSpent(0);
      return;
    }
    const entries = await fetchCardTimelogs(
      cur.folder.id,
      cur.mod[2].id,
      id
    );
    setCardLogs(entries);
    setSpent(entries.reduce((sum, e) => sum + (e.durationSec || 0), 0));
  };

  useEffect(() => {
    if (isDraft || !curLoc || curLoc.mod[0] !== "Board" || !draft.id) {
      setCardLogs([]);
      setSpent(0);
      return;
    }
    let cancelled = false;
    fetchCardTimelogs(curLoc.folder.id, curLoc.mod[2].id, draft.id).then(
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
  }, [isDraft, curLoc, draft.id, logsRefreshKey]);

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
    if (!curLoc) return {};
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
        (origin.folder.id !== cur.folder.id ||
          origin.mod[2].id !== cur.mod[2].id)
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
    !isDraft && curLoc?.mod[0] === "Board" && !!draft.id;
  const showTimelogSection =
    canTimelogCard && (cardLogs.length > 0 || timerActive);
  const canAddFile =
    !readonly &&
    !!curLoc?.folder?.id &&
    curLoc?.mod?.[0] === "Board" &&
    !!draft.id;
  const cardFiles = Array.isArray(draft.files) ? draft.files : [];
  const imageUpload =
    canAddFile
      ? {
          scope: "card",
          project: curLoc.folder.id,
          board: curLoc.mod[2].id,
          card: draft.id,
          onApplyWorkspace: (res) => {
            if (Array.isArray(res?.images)) {
              setDraft((d) => {
                const next = { ...d, images: res.images };
                draftRef.current = next;
                return next;
              });
            }
            onApplyWorkspace?.(
              res,
              keepNav?.(curLoc.folder.id, curLoc.mod[2].id)
            );
          },
        }
      : null;

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
          project: curLoc.folder.id,
          board: curLoc.mod[2].id,
          card: draft.id,
          name: file.name,
          mime: file.type || "application/octet-stream",
          data,
        });
        files = res.files || [];
        setDraftFiles(files);
        onApplyWorkspace?.(res, keepNav?.(curLoc.folder.id, curLoc.mod[2].id));
      }
    } catch (err) {
      window.alert(err.message || "Could not upload file");
    } finally {
      setFileBusy(false);
    }
  };

  const removeCardFile = async (file) => {
    if (!canAddFile || !file?.id || fileBusy) return;
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
        project: curLoc.folder.id,
        board: curLoc.mod[2].id,
        card: draft.id,
        file: file.id,
      });
      setDraftFiles(res.files || []);
      onApplyWorkspace?.(res, keepNav?.(curLoc.folder.id, curLoc.mod[2].id));
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
          (curLoc ? " tint" : "") +
          (isDb ? " dlg-db" : "") +
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
              {!isDraft ? (
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
                    const checked = e.target.checked;
                    const doneAt = checked ? new Date().toISOString() : "";
                    if (checked) playTaskCompleteSound();
                    patch({ doneAt });
                    clearTimeout(persistTimer.current);
                    draftRef.current = { ...draftRef.current, doneAt };
                    const loc = curLocRef.current;
                    persist().then(() => {
                      if (checked && loc?.folder && loc?.mod) {
                        onStopActiveTimerForCard?.(
                          loc.folder,
                          loc.mod,
                          draftRef.current
                        );
                      }
                    });
                  }}
                />
              ) : null}
              <TitleArea
                className={"title" + (isDone(draft) ? " done" : "")}
                value={draft.n || ""}
                placeholder={isDraft ? "New task..." : "Untitled"}
                autoFocus={!readonly}
                readOnly={readonly}
                onChange={(e) => {
                  if (readonly) return;
                  patch({ n: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (readonly || e.key !== "Enter") return;
                  e.preventDefault();
                  if (isDraft && !(draft.n || "").trim()) return;
                  close(isDraft);
                }}
              />
              {!readonly &&
                !isDraft &&
                curLoc?.mod[0] === "Board" &&
                draft.id && (
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
                      await onDelete(curLoc.folder, curLoc.mod, draft.id);
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
              onDuplicate={
                !readonly && onDuplicate && draft.id
                  ? async () => {
                      clearTimeout(persistTimer.current);
                      await persist();
                      await onDuplicate(draft, originLoc || curLoc);
                    }
                  : undefined
              }
              onDelete={
                !readonly && onDelete && draft.id
                  ? async () => {
                      const loc = originLoc || curLoc;
                      const label =
                        (draft.n || "").trim() || "Untitled";
                      const ok = await askConfirm({
                        title: `Delete "${label}"?`,
                        confirmLabel: "Delete",
                        danger: true,
                      });
                      if (!ok) return;
                      clearTimeout(persistTimer.current);
                      await onDelete(loc.folder, loc.mod, draft.id);
                      onClose({ deleted: true });
                    }
                  : undefined
              }
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
                          curLoc.folder.id === folder.id &&
                          curLoc.mod[2].id === mod[2].id;
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
                          renderOption: (o) => {
                            const c = o.folder.color || PC[0];
                            return (
                              <>
                                <span
                                  className="dot"
                                  style={{ background: c }}
                                />
                                <span style={{ color: c }}>{o.label}</span>
                              </>
                            );
                          },
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
                  {normalizeEffort(draft.effort) ? (
                    <div className="prop-chip card-file-chip">
                      <CardMetaPicker
                        kind="effort"
                        level={draft.effort}
                        size={18}
                        showLabel
                        align="left"
                        disabled={readonly}
                        onChange={(level) => {
                          patch({ effort: level });
                          clearTimeout(persistTimer.current);
                          draftRef.current = {
                            ...draftRef.current,
                            effort: level,
                          };
                          persist();
                        }}
                      />
                      {!readonly ? (
                        <button
                          type="button"
                          className="card-file-chip-del"
                          title="Remove effort"
                          aria-label="Remove effort"
                          onClick={(e) => {
                            e.stopPropagation();
                            patch({ effort: "" });
                            clearTimeout(persistTimer.current);
                            draftRef.current = {
                              ...draftRef.current,
                              effort: "",
                            };
                            persist();
                          }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {normalizeImpact(draft.impact) ? (
                    <div className="prop-chip card-file-chip">
                      <CardMetaPicker
                        kind="impact"
                        level={draft.impact}
                        size={18}
                        showLabel
                        align="left"
                        disabled={readonly}
                        onChange={(level) => {
                          patch({ impact: level });
                          clearTimeout(persistTimer.current);
                          draftRef.current = {
                            ...draftRef.current,
                            impact: level,
                          };
                          persist();
                        }}
                      />
                      {!readonly ? (
                        <button
                          type="button"
                          className="card-file-chip-del"
                          title="Remove impact"
                          aria-label="Remove impact"
                          onClick={(e) => {
                            e.stopPropagation();
                            patch({ impact: "" });
                            clearTimeout(persistTimer.current);
                            draftRef.current = {
                              ...draftRef.current,
                              impact: "",
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
                    <div key={file.id} className="prop-chip card-file-chip">
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
                      canAddImpact
                      canAddEffort
                      canAddFile={canAddFile}
                      canTimelog={canTimelogCard && !showTimelogSection}
                      showTimers={showTimelogs}
                      folder={curLoc?.folder}
                      mod={curLoc?.mod}
                      row={draft}
                      onAddDescription={() => setShowDescription(true)}
                      onAddImpact={(level) => {
                        patch({ impact: level });
                        clearTimeout(persistTimer.current);
                        draftRef.current = {
                          ...draftRef.current,
                          impact: level,
                        };
                        persist();
                      }}
                      onAddEffort={(level) => {
                        patch({ effort: level });
                        clearTimeout(persistTimer.current);
                        draftRef.current = {
                          ...draftRef.current,
                          effort: level,
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
                    variant="mini"
                    imageUpload={imageUpload}
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
                    {timerActive && liveTimerLabel ? (
                      <li className="dlg-timelog-item is-running">
                        <span className="dlg-timelog-note dlg-timelog-running">
                          <Icon name="runningClock" size={14} />
                          Running
                        </span>
                        <span className="dlg-timelog-date" aria-hidden="true" />
                        <span className="dlg-timelog-dur dlg-timelog-live">
                          {liveTimerLabel}
                        </span>
                        <button
                          type="button"
                          className={
                            "dlg-timelog-stop-btn" +
                            (liveCanSave ? "" : " is-cancel")
                          }
                          title={liveCanSave ? "Save timelog" : "Cancel timer"}
                          aria-label={
                            liveCanSave ? "Save timelog" : "Cancel timer"
                          }
                          onClick={async () => {
                            await onStopPomo?.();
                            await reloadCardLogs();
                          }}
                        >
                          {liveCanSave ? "Save" : "Cancel"}
                        </button>
                      </li>
                    ) : null}
                    {cardLogs.map((entry) => {
                      const stamp = entry.endedAt || entry.startedAt || "";
                      return (
                        <li key={entry.id} className="dlg-timelog-item">
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
                            <TimelogMoreMenu
                              className="dlg-timelog-entry-more"
                              onEdit={async () => {
                                await onEditTimelog?.(entry);
                                await reloadCardLogs();
                              }}
                              onDelete={async () => {
                                const ok = await askConfirm({
                                  title: "Delete this timelog?",
                                  confirmLabel: "Delete",
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await deleteTimelogApi({ id: entry.id });
                                  await reloadCardLogs();
                                } catch {
                                  /* keep list as-is */
                                }
                              }}
                            />
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
                disabled={!(draft.n || "").trim()}
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
    {previewFile && curLoc?.folder?.id && curLoc?.mod?.[2]?.id && draft.id ? (
      <FilePreviewDialog
        file={previewFile}
        files={cardFiles}
        onFileChange={setPreviewFile}
        project={curLoc.folder.id}
        board={curLoc.mod[2].id}
        card={draft.id}
        downloadUrl={cardFileDownloadUrl(
          curLoc.folder.id,
          curLoc.mod[2].id,
          draft.id,
          previewFile.id
        )}
        onClose={() => setPreviewFile(null)}
      />
    ) : null}
    </>
  );
}

function dbTitleCol(cols) {
  return cols.find((c) => c.id === "n") || cols.find((c) => c.type === "text");
}

function activeDbHiddenCols(modData) {
  const customViews = normalizeCustomViews(modData?.customViews);
  const viewId = resolveCustomViewId(modData?.customViewId, customViews);
  const active = customViews.find((v) => v.id === viewId) || customViews[0];
  return normalizeHiddenCols(active?.hiddenCols);
}

function DbFieldGroups({
  cols,
  row,
  stages,
  readonly,
  focusId,
  onPatch,
  onPersist,
  leading = null,
}) {
  if (!cols.length && !leading) return null;
  return (
    <div className="dlg-fields db-entry-fields">
      <div className="db-entry-rows">
        {leading}
        {cols.map((c) => {
          const rich = c.type === "longtext";
          return (
            <div
              key={c.id}
              className={"db-entry-row" + (rich ? " is-rich" : "")}
            >
              <span className="db-entry-lab">
                <Icon name={fieldTypeIcon(c.type)} size={14} />
                <span className="db-entry-lab-text">{c.label}</span>
              </span>
              <div className="db-entry-val">
                {rich ? (
                  <RichTextEditor
                    value={row[c.id] || ""}
                    label={c.label || "Notes"}
                    showLabel={false}
                    placeholder="Write something…"
                    editable={!readonly}
                    showToolbar={!readonly}
                    variant="mini"
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
                    autoFocus={!readonly && c.id === focusId}
                    onChange={(next) => onPatch({ [c.id]: next })}
                    onCommit={() => onPersist()}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DbFields({
  row,
  loc,
  stages,
  readonly,
  onPatch,
  onPersist,
  onDuplicate,
  onDelete,
}) {
  const modData = loc?.mod?.[2];
  const cols = (modData?.cols || []).filter(Boolean);
  const hiddenList = activeDbHiddenCols(modData);
  const hiddenIds = new Set(hiddenList);
  const visibleCols = visibleDbCols(cols, hiddenList);
  const hiddenCols = cols.filter((c) => hiddenIds.has(c.id));
  const titleCol = dbTitleCol(visibleCols);
  const visibleRest = titleCol
    ? visibleCols.filter((c) => c.id !== titleCol.id)
    : visibleCols;
  const focusId = readonly
    ? null
    : titleCol?.id ||
      visibleRest.find((c) => c.type !== "longtext")?.id ||
      visibleRest[0]?.id ||
      hiddenCols.find((c) => c.type !== "longtext")?.id ||
      hiddenCols[0]?.id ||
      null;
  const canOrganise = !!(onDuplicate || onDelete);

  if (!cols.length && !canOrganise) return null;

  return (
    <>
      {cols.length ? (
        <DbFieldGroups
          cols={visibleRest}
          row={row}
          stages={stages}
          readonly={readonly}
          focusId={focusId}
          onPatch={onPatch}
          onPersist={onPersist}
          leading={
            titleCol ? (
              <div className="db-entry-row is-title">
                <span className="db-entry-lab">
                  <Icon name={fieldTypeIcon(titleCol.type)} size={14} />
                  <span className="db-entry-lab-text">{titleCol.label}</span>
                </span>
                <div className="db-entry-title-val">
                  <div className="db-entry-val">
                    <TitleArea
                      className="title"
                      value={row[titleCol.id] || ""}
                      placeholder={
                        titleCol.id === "n"
                          ? "New record"
                          : titleCol.label || "Untitled"
                      }
                      autoFocus={focusId === titleCol.id}
                      readOnly={readonly}
                      onChange={(e) => {
                        if (readonly) return;
                        onPatch({ [titleCol.id]: e.target.value });
                      }}
                      onBlur={() => {
                        if (readonly) return;
                        onPersist();
                      }}
                      onKeyDown={(e) => {
                        if (readonly || e.key !== "Enter") return;
                        e.preventDefault();
                        e.currentTarget.blur();
                      }}
                    />
                  </div>
                  {canOrganise ? (
                    <DbOrganiseMenu
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                    />
                  ) : null}
                </div>
              </div>
            ) : null
          }
        />
      ) : null}

      {hiddenCols.length ? (
        <div className="db-entry-hidden">
          <h3 className="db-entry-section-lab">
            Hidden columns in current view
          </h3>
          <DbFieldGroups
            cols={hiddenCols}
            row={row}
            stages={stages}
            readonly={readonly}
            focusId={focusId}
            onPatch={onPatch}
            onPersist={onPersist}
          />
        </div>
      ) : null}
    </>
  );
}
