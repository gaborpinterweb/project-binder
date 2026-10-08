import { useEffect, useRef, useState } from "react";
import { cardTimeSpentSec } from "../api.js";
import { Icon } from "../icons.jsx";
import {
  PC,
  allBoards,
  boardLabel,
  formatSpent,
  isDone,
  pastel,
} from "../utils.js";
import { fieldTypeIcon } from "../dbFields.js";
import DbFieldInput from "./DbFieldInput.jsx";
import PropDropdown, { PropAffix, closePropDrops } from "./PropDropdown.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import TimelogDropdown from "./TimelogDropdown.jsx";
import { askConfirm } from "../confirmDialog.js";

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
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => run(onDelete)}
          >
            Delete
          </button>
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
  onOpenTimelogs,
  onMoveCard,
  onSaveItem,
  showMasterColumn = true,
  showTimelogs = true,
}) {
  const [curLoc, setCurLoc] = useState(
    isDraft && loc
      ? { folder: loc.folder, mod: loc.mod }
      : loc
        ? { folder: loc.folder, mod: loc.mod }
        : null
  );
  const [originLoc, setOriginLoc] = useState(loc);
  const [draft, setDraft] = useState(() => ({ ...row }));
  const [spent, setSpent] = useState(0);
  const persistTimer = useRef(null);
  const draftRef = useRef(draft);
  const curLocRef = useRef(curLoc);
  const originLocRef = useRef(originLoc);
  draftRef.current = draft;
  curLocRef.current = curLoc;
  originLocRef.current = originLoc;

  const isDb = !isDraft && originLoc?.mod?.[0] === "Database";

  useEffect(() => {
    if (readonly || isDraft || !curLoc || curLoc.mod[0] !== "Board" || !draft.slug) return;
    let cancelled = false;
    cardTimeSpentSec(curLoc.folder.slug, curLoc.mod[2].slug, draft.slug).then(
      (total) => {
        if (!cancelled) setSpent(total);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [readonly, isDraft, curLoc, draft.slug]);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") close(false);
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

  return (
    <div
      className="ov ov-top"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
        else if (!e.target.closest?.(".prop-dd")) closePropDrops();
      }}
    >
      <div className={"dlg" + (curLoc && !isDb ? " tint" : "")} style={tintStyle}>
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
                        {boardLabel(curLoc?.folder, curLoc?.mod)}
                      </span>
                    </span>
                  ) : (
                    <PropDropdown
                      className="prop-chip"
                      value={
                        curLoc
                          ? curLoc.folder.slug + "/" + curLoc.mod[2].slug
                          : ""
                      }
                      options={boards.map(({ folder, mod }) => ({
                        value: folder.slug + "/" + mod[2].slug,
                        label: boardLabel(folder, mod),
                        folder,
                        mod,
                      }))}
                      onChange={(_v, o) => {
                        const next = { folder: o.folder, mod: o.mod };
                        setCurLoc(next);
                        curLocRef.current = next;
                        const cols = next.mod[2]?.columns || stages;
                        if (!cols.includes(draftRef.current.s)) {
                          patch({ s: cols[0] || stages[0] });
                        }
                        clearTimeout(persistTimer.current);
                        persist();
                      }}
                      renderOption={(o) => (
                        <>
                          <span
                            className="dot"
                            style={{
                              background: o.folder.color || PC[0],
                            }}
                          />
                          {o.label}
                        </>
                      )}
                    >
                      <span
                        className="dot"
                        style={{
                          background: curLoc?.folder.color || PC[0],
                        }}
                      />
                      <span className="lab">
                        {boardLabel(curLoc?.folder, curLoc?.mod)}
                      </span>
                    </PropDropdown>
                  )}
                  {readonly ? (
                    <span className="prop-chip prop-chip-ro" title="Board">
                      <Icon name="Board" size={12} />
                      <span className="lab">{draft.s || ""}</span>
                    </span>
                  ) : (
                    <PropDropdown
                      className="prop-chip"
                      value={draft.s || ""}
                      options={curLoc?.mod[2]?.columns || stages}
                      onChange={(o) => {
                        patch({ s: o });
                        clearTimeout(persistTimer.current);
                        draftRef.current = { ...draftRef.current, s: o };
                        persist();
                      }}
                    >
                      <Icon name="Board" size={12} />
                      <span className="lab">{draft.s || ""}</span>
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
                        value={draft.ms || stages[0]}
                        options={stages}
                        onChange={(o) => {
                          patch({ ms: o });
                          clearTimeout(persistTimer.current);
                          draftRef.current = { ...draftRef.current, ms: o };
                          persist();
                        }}
                      >
                        <Icon name="Masterboard" size={12} />
                        <span className="lab">{draft.ms || ""}</span>
                      </PropDropdown>
                    ))}
                  {!isDraft &&
                    !readonly &&
                    curLoc?.mod[0] === "Board" &&
                    draft.slug && (
                      <TimelogDropdown
                        className="prop-dd prop-chip"
                        buttonClassName="prop-dd-btn"
                        folder={curLoc.folder}
                        mod={curLoc.mod}
                        row={draft}
                        showTimers={showTimelogs}
                        onStartPomo={onStartPomo}
                        onAddManualTimelog={onAddManualTimelog}
                        onOpenTimelogs={onOpenTimelogs}
                        onAfterAction={async () => {
                          await close(false);
                        }}
                      >
                        <Icon name="Timelogs" size={12} />
                        <span className="lab">{formatSpent(spent)}</span>
                        <PropAffix kind="caret" />
                      </TimelogDropdown>
                    )}
                </div>
              </div>
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
                Create
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
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
