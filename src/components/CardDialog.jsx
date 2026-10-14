import { useEffect, useRef, useState } from "react";
import {
  cardFileDownloadUrl,
  deleteCardFileApi,
  fetchCardTimelogs,
  postCardFile,
} from "../api.js";
import { Icon } from "../icons.jsx";
import {
  DIFFICULTY_LEVELS,
  IMPACT_LEVELS,
  normalizeDifficulty,
  normalizeImpact,
} from "../cardMeta.js";
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
import {
  normalizeCustomViews,
  normalizeHiddenCols,
  resolveCustomViewId,
  visibleDbCols,
} from "../dbViews.js";
import DbFieldInput from "./DbFieldInput.jsx";
import CardTitleIcons, { CardMetaIcon } from "./CardTitleIcons.jsx";
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
  canAddDifficulty,
  canTimelog,
  canAddFile,
  showTimers,
  folder,
  mod,
  row,
  onAddDescription,
  onAddImpact,
  onAddDifficulty,
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
    !canAddDifficulty &&
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
                  <Icon name="exclamation" size={14} />
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
          {canAddDifficulty ? (
            <div className="card-add-sub">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="card-add-sub-trigger"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="dd-opt">
                  <Icon name="zap" size={14} />
                  Difficulty
                </span>
                <Icon name="arrow" size={12} />
              </button>
              <div className="pop card-add-sub-menu" role="menu">
                {DIFFICULTY_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      onAddDifficulty?.(level);
                    }}
                  >
                    <span className="dd-opt">
                      <CardMetaIcon
                        kind="difficulty"
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
  const showTimelogSection = canTimelogCard && cardLogs.length > 0;
  const canAddFile =
    !readonly &&
    !!curLoc?.folder?.id &&
    curLoc?.mod?.[0] === "Board" &&
    !!draft.id;
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
              <CardTitleIcons
                files={draft.files}
                timerActive={timerActive}
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
                  {normalizeImpact(draft.impact) ? (
                    <div className="prop-chip card-file-chip">
                      <span className="card-file-chip-lab">
                        <CardMetaIcon
                          kind="impact"
                          level={draft.impact}
                          size={18}
                          decorative
                        />
                        <span className="lab">Impact: {draft.impact}</span>
                      </span>
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
                  {normalizeDifficulty(draft.difficulty) ? (
                    <div className="prop-chip card-file-chip">
                      <span className="card-file-chip-lab">
                        <CardMetaIcon
                          kind="difficulty"
                          level={draft.difficulty}
                          size={18}
                          decorative
                        />
                        <span className="lab">
                          Difficulty: {draft.difficulty}
                        </span>
                      </span>
                      {!readonly ? (
                        <button
                          type="button"
                          className="card-file-chip-del"
                          title="Remove difficulty"
                          aria-label="Remove difficulty"
                          onClick={(e) => {
                            e.stopPropagation();
                            patch({ difficulty: "" });
                            clearTimeout(persistTimer.current);
                            draftRef.current = {
                              ...draftRef.current,
                              difficulty: "",
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
                      canAddDifficulty
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
                      onAddDifficulty={(level) => {
                        patch({ difficulty: level });
                        clearTimeout(persistTimer.current);
                        draftRef.current = {
                          ...draftRef.current,
                          difficulty: level,
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
}) {
  if (!cols.length) return null;
  return (
    <div className="dlg-fields db-entry-fields">
      <div className="db-entry-rows">
        {cols.map((c) => {
          const rich = c.type === "longtext";
          return (
            <div
              key={c.id}
              className={"db-entry-row" + (rich ? " is-rich" : "")}
            >
              <span className="db-entry-lab">
                <Icon name={fieldTypeIcon(c.type)} size={14} />
                <span className="db-entry-lab-text">
                  {c.label}
                  {c.required ? <span className="db-req">*</span> : null}
                </span>
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

function DbFields({ row, loc, stages, readonly, onPatch, onPersist }) {
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

  if (!cols.length) return null;

  return (
    <>
      {titleCol ? (
        <div className="title-row">
          <TitleArea
            className="title"
            value={row[titleCol.id] || ""}
            placeholder={
              titleCol.id === "n" ? "New entry" : titleCol.label || "Untitled"
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
      ) : null}

      <DbFieldGroups
        cols={visibleRest}
        row={row}
        stages={stages}
        readonly={readonly}
        focusId={focusId}
        onPatch={onPatch}
        onPersist={onPersist}
      />

      {hiddenCols.length ? (
        <div className="db-entry-hidden">
          <h3 className="db-entry-section-lab">
            Hidden fields in current view
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
