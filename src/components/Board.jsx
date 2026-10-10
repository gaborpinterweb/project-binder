import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  putItem,
  postItem,
  putDatabase,
  putBoard,
  putMasterboard,
  putCardOrder,
  fetchWorkspace,
  fetchTimelogs,
} from "../api.js";
import { flipSwapHorizontal } from "../flipSwap.js";
import {
  emptyFieldValue,
  fieldTypeIcon,
  normalizeDbCol,
  serializeDbCol,
} from "../dbFields.js";
import { filterRows } from "../dbFilters.js";
import { sortRows } from "../dbSorts.js";
import {
  createCustomView,
  DEFAULT_VIEW_ID,
  isDefaultCustomView,
  normalizeCustomViews,
  resolveCustomViewId,
  visibleDbCols,
} from "../dbViews.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";
import DbColumnsDropdown from "./DbColumnsDropdown.jsx";
import DbFieldInput from "./DbFieldInput.jsx";
import DbFiltersDropdown from "./DbFiltersDropdown.jsx";
import DbSortsDropdown from "./DbSortsDropdown.jsx";
import FieldEditDialog from "./FieldEditDialog.jsx";
import { askPrompt } from "../promptDialog.js";
import { askConfirm } from "../confirmDialog.js";
import {
  PC,
  STAGES,
  allBoardTasks,
  allBoards,
  boardKey,
  boardLabel,
  boardColumnLabel,
  byOrd,
  colCollapseKey,
  columnRows,
  confirmDeleteColumn,
  formatSpent,
  getBoardShow,
  groupByDoneDay,
  isDone,
  pastel,
  playTaskCompleteSound,
  taskKey,
  COMPLETED_VIEWS,
  loadCompletedViews,
  loadDbViewsSidebar,
  saveDbViewsSidebar,
} from "../utils.js";
import GlobalBar from "./GlobalBar.jsx";
import { TimelogContextMenu } from "./TimelogDropdown.jsx";

const DRAG_THRESHOLD_PX = 6;

function getCompletedView(scope, completedViewByScope) {
  if (completedViewByScope.has(scope)) {
    const cached = completedViewByScope.get(scope);
    return COMPLETED_VIEWS.includes(cached) ? cached : "hide";
  }
  const stored = loadCompletedViews()[scope];
  const mode = COMPLETED_VIEWS.includes(stored) ? stored : "hide";
  completedViewByScope.set(scope, mode);
  return mode;
}

function cardDragKey(row, folder, mod) {
  return `${folder?.slug || ""}/${mod?.[2]?.slug || ""}/${row?.slug || row?.n || ""}`;
}

function orderPayload(row, folder, mod, ord) {
  return {
    project: folder.slug,
    board: mod[2].slug,
    slug: row.slug,
    title: row.n || "Untitled",
    status: row.s,
    master: row.ms,
    doneAt: row.doneAt || "",
    body: row.body || "",
    ord,
  };
}

function findDropTarget(clientX, clientY) {
  const stack = document.elementsFromPoint(clientX, clientY);
  let col = null;
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (el.classList.contains("done-col")) return { done: true };
    if (el.classList.contains("col") && el.dataset.col) {
      col = el;
      break;
    }
  }
  if (!col) return null;
  const column = col.dataset.col;
  if (col.classList.contains("collapsed")) return { column, index: 0 };
  const body = col.querySelector(":scope > .col-body");
  if (!body) return { column, index: 0 };
  const cards = [...body.querySelectorAll(":scope > .card:not(.dragging)")];
  let index = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      index = i;
      break;
    }
  }
  return { column, index };
}

function useBoardCardDrag(boardEdit, resolveDrop) {
  const [dragKey, setDragKey] = useState(null);
  const [dragHeight, setDragHeight] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [dropHint, setDropHint] = useState(null);
  const sessionRef = useRef(null);
  const hintRef = useRef(null);
  const movedRef = useRef(false);
  const previewElRef = useRef(null);
  const resolveRef = useRef(resolveDrop);
  resolveRef.current = resolveDrop;

  const setHint = useCallback((hint) => {
    hintRef.current = hint;
    setDropHint(hint);
  }, []);

  const movePreview = useCallback((clientX, clientY, session) => {
    const el = previewElRef.current;
    if (!el || !session) return;
    el.style.transform = `translate(${clientX - session.offsetX}px, ${clientY - session.offsetY}px)`;
  }, []);

  const cleanup = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      window.removeEventListener("pointermove", session.onMove);
      window.removeEventListener("pointerup", session.onUp);
      window.removeEventListener("pointercancel", session.onUp);
    }
    sessionRef.current = null;
    setDragKey(null);
    setDragHeight(null);
    setDragPreview(null);
    setHint(null);
    document.body.classList.remove("is-card-dragging");
  }, [setHint]);

  useEffect(() => () => cleanup(), [cleanup]);

  const armDrag = useCallback(
    (e, payload, key) => {
      if (boardEdit || e.button !== 0) return;
      if (e.target.closest?.(".card-check")) return;
      if (sessionRef.current) cleanup();

      movedRef.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      const session = {
        payload,
        key,
        el: e.currentTarget,
        x: e.clientX,
        y: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        pointerId: e.pointerId,
        started: false,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };

      session.onMove = (ev) => {
        if (ev.pointerId !== session.pointerId) return;
        const dist = Math.hypot(ev.clientX - session.x, ev.clientY - session.y);
        if (!session.started) {
          if (dist < DRAG_THRESHOLD_PX) return;
          session.started = true;
          movedRef.current = true;
          const row = payload.row || payload;
          const folder = payload.folder;
          const mod = payload.mod;
          const color =
            payload.color || folder?.color || PC[0];
          const src =
            payload.src ||
            (folder && mod ? boardLabel(folder, mod) : "");
          setDragKey(key);
          setDragHeight(session.height);
          setDragPreview({
            width: session.width,
            height: session.height,
            color,
            done: isDone(row),
            title: row.n || "Untitled",
            src,
            x: ev.clientX - session.offsetX,
            y: ev.clientY - session.offsetY,
          });
          document.body.classList.add("is-card-dragging");
        } else {
          movePreview(ev.clientX, ev.clientY, session);
        }
        ev.preventDefault();
        setHint(findDropTarget(ev.clientX, ev.clientY));
      };

      session.onUp = (ev) => {
        if (ev.pointerId !== session.pointerId) return;
        const started = session.started;
        const hint = hintRef.current;
        const dragPayload = session.payload;
        cleanup();
        if (started) resolveRef.current?.(dragPayload, hint);
      };

      sessionRef.current = session;
      window.addEventListener("pointermove", session.onMove, { passive: false });
      window.addEventListener("pointerup", session.onUp);
      window.addEventListener("pointercancel", session.onUp);
    },
    [boardEdit, cleanup, movePreview, setHint]
  );

  const consumeDragClick = useCallback(() => {
    if (!movedRef.current) return false;
    movedRef.current = false;
    return true;
  }, []);

  return {
    dragKey,
    dragHeight,
    dragPreview,
    previewElRef,
    dropHint,
    armDrag,
    consumeDragClick,
  };
}

function DropShadow({ height }) {
  return (
    <div
      className="drop-shadow"
      aria-hidden="true"
      style={height ? { height } : undefined}
    />
  );
}

function DragPreview({ preview, previewElRef }) {
  if (!preview) return null;
  const pc = preview.color || PC[0];
  return createPortal(
    <div
      ref={previewElRef}
      className={"card tint drag-preview" + (preview.done ? " done" : "")}
      style={{
        ["--pc"]: pc,
        background: pastel(pc),
        width: preview.width,
        height: preview.height,
        transform: `translate(${preview.x}px, ${preview.y}px)`,
      }}
      aria-hidden="true"
    >
      <b>
        <span className="card-check drag-preview-check" aria-hidden="true" />
        <span className="card-name">{preview.title}</span>
      </b>
      {preview.src ? <span className="src">{preview.src}</span> : null}
    </div>,
    document.body
  );
}

function renderOpenCards(items, column, dropHint, dragHeight, dragKey, renderCard) {
  const hintHere = dropHint && !dropHint.done && dropHint.column === column;
  const visible = dragKey
    ? items.filter((item) => item.dragKey !== dragKey)
    : items;
  return (
    <>
      {visible.map((item, i) => (
        <Fragment key={item.key}>
          {hintHere && dropHint.index === i ? (
            <DropShadow height={dragHeight} />
          ) : null}
          {renderCard(item, i)}
        </Fragment>
      ))}
      {hintHere && dropHint.index === visible.length ? (
        <DropShadow height={dragHeight} />
      ) : null}
    </>
  );
}

function TaskCard({
  row,
  folder,
  mod,
  color,
  src,
  spentSec,
  showTimeSpent = false,
  activeTimerKey = null,
  boardEdit,
  noDrag,
  dragPayload,
  dragKey,
  cardKey,
  onArmDrag,
  consumeDragClick,
  onOpen,
  onToggleDone,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
  readonly = false,
}) {
  const pc = color || folder?.color || PC[0];
  const done = isDone(row);
  const canDrag = !boardEdit && !noDrag;
  const key = cardKey || cardDragKey(row, folder, mod);
  const dragging = dragKey === key;
  const canTimelog =
    !boardEdit && !readonly && folder && mod?.[2]?.slug && row?.slug;
  const timerActive =
    !!activeTimerKey &&
    !!folder?.slug &&
    !!mod?.[2]?.slug &&
    !!row?.slug &&
    taskKey(folder.slug, mod[2].slug, row.slug) === activeTimerKey;
  const [timelogMenu, setTimelogMenu] = useState(null);
  return (
    <div
      className={"card tint" + (done ? " done" : "") + (dragging ? " dragging" : "")}
      style={{ ["--pc"]: pc, background: pastel(pc) }}
      onClick={() => {
        if (boardEdit) return;
        if (consumeDragClick?.()) return;
        onOpen(row);
      }}
      onContextMenu={(e) => {
        if (!canTimelog) return;
        e.preventDefault();
        e.stopPropagation();
        setTimelogMenu({ left: e.clientX, top: e.clientY });
      }}
      onPointerDown={(e) => {
        if (!canDrag) return;
        onArmDrag?.(e, dragPayload || { row, folder, mod }, key);
      }}
    >
      <b>
        <input
          type="checkbox"
          className="card-check"
          checked={done}
          title={done ? "Mark active" : "Mark completed"}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={async (e) => {
            e.stopPropagation();
            await onToggleDone(row, folder, mod, e.target.checked);
          }}
        />
        {timerActive ? (
          <span className="card-timer-dot" title="Timer active" aria-label="Timer active" />
        ) : null}
        <span className="card-name">{row.n || "Untitled"}</span>
      </b>
      {src ? <span className="src">{src}</span> : null}
      {showTimeSpent ? (
        <span className="card-spent">{formatSpent(spentSec || 0)}</span>
      ) : null}
      {timelogMenu
        ? createPortal(
            <TimelogContextMenu
              left={timelogMenu.left}
              top={timelogMenu.top}
              folder={folder}
              mod={mod}
              row={row}
              onStartPomo={onStartPomo}
              onAddManualTimelog={onAddManualTimelog}
              onOpenTimelogs={onOpenTimelogs}
              onClose={() => setTimelogMenu(null)}
            />,
            document.body
          )
        : null}
    </div>
  );
}

const COMPLETED_VIEW_OPTIONS = [
  { value: "hide", label: "Hide completed" },
  { value: "inplace", label: "Show completed tasks" },
  { value: "virtual", label: "Show completed column" },
];

const BOARD_SHOW_OPTIONS = [
  { value: "projectName", label: "Project name" },
  { value: "timeSpent", label: "Time spent" },
];

function useCardSpentByKey(enabled, refreshKey) {
  const [spentByKey, setSpentByKey] = useState(() => new Map());
  useEffect(() => {
    if (!enabled) {
      setSpentByKey(new Map());
      return;
    }
    let cancelled = false;
    fetchTimelogs()
      .then((entries) => {
        if (cancelled) return;
        const map = new Map();
        for (const e of entries || []) {
          const key = taskKey(e.project, e.board, e.card);
          map.set(key, (map.get(key) || 0) + (e.durationSec || 0));
        }
        setSpentByKey(map);
      })
      .catch(() => {
        if (!cancelled) setSpentByKey(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);
  return spentByKey;
}

function cardSpentSec(spentByKey, folder, mod, row) {
  if (!folder?.slug || !mod?.[2]?.slug || !row?.slug) return 0;
  return spentByKey.get(taskKey(folder.slug, mod[2].slug, row.slug)) || 0;
}

function CompletedViewBtn({
  scope,
  completedViewByScope,
  boardShowByScope,
  onChange,
  onSetBoardShow,
  triggerLabel,
  align = "right",
}) {
  const mode = getCompletedView(scope, completedViewByScope);
  const show = getBoardShow(scope, boardShowByScope);
  const asViewMenu = Boolean(triggerLabel);
  return (
    <Dropdown
      className={asViewMenu ? "mod-view-dd" : "done-view-dd"}
      buttonClassName={asViewMenu ? "mod-act" : "done-view"}
      ariaLabel={asViewMenu ? "View options" : "Completed tasks view"}
      title={asViewMenu ? "View options" : "Completed tasks view"}
      align={align}
      caret={!asViewMenu}
      sections={[
        {
          label: "Completed",
          value: mode,
          onChange: (next) => {
            if (next === mode) return;
            onChange(scope, next);
          },
          options: COMPLETED_VIEW_OPTIONS,
        },
        {
          label: "Show",
          closeOnSelect: false,
          onChange: (key) => {
            if (key === "projectName") {
              onSetBoardShow(scope, { projectName: !show.projectName });
            } else if (key === "timeSpent") {
              onSetBoardShow(scope, { timeSpent: !show.timeSpent });
            }
          },
          options: BOARD_SHOW_OPTIONS.map((o) => ({
            ...o,
            checked: show[o.value],
          })),
          renderOption: (o) => (
            <span className="dd-check">
              <input type="checkbox" checked={!!o.checked} readOnly tabIndex={-1} />
              {o.label}
            </span>
          ),
        },
      ]}
    >
      {asViewMenu ? (
        <>
          <Icon name="eye" size={18} />
          <span className="mod-act-lab">{triggerLabel}</span>
        </>
      ) : undefined}
    </Dropdown>
  );
}

function BoardEditBtn({ boardEdit, onToggle }) {
  const label = boardEdit ? "Save columns" : "Edit columns";
  return (
    <button
      type="button"
      className={"mod-act bedit" + (boardEdit ? " on" : "")}
      title={label}
      aria-label={label}
      onClick={onToggle}
    >
      <Icon name={boardEdit ? "Task" : "pencil"} size={18} />
      <span className="mod-act-lab">{label}</span>
    </button>
  );
}

function fillDoneGroups(items, opts, cardProps) {
  if (!items.length) {
    if (opts?.showEmpty !== false) {
      return <div className="done-empty">No completed tasks</div>;
    }
    return null;
  }
  const groups = groupByDoneDay(items.map((i) => i.row));
  return groups.map((group) => (
    <div className="day-group" key={group.key}>
      <div className="day-title">{group.title}</div>
      {group.rows.map((r) => {
        const item = items.find((i) => i.row === r);
        if (!item) return null;
        return (
          <TaskCard
            key={r.slug || r.n}
            row={r}
            folder={item.folder}
            mod={item.mod}
            color={item.color}
            src={item.src}
            spentSec={item.spentSec}
            dragPayload={item.dragPayload}
            {...cardProps}
          />
        );
      })}
    </div>
  ));
}

function findBoardColEl(boardEl, name) {
  if (!boardEl) return null;
  return [...boardEl.querySelectorAll(":scope > .col")].find(
    (el) => el.dataset.col === name
  );
}

/** FLIP-animate two columns after applyOrder reorders the DOM. */
function flipSwapColumns(boardEl, leftName, rightName, applyOrder) {
  flipSwapHorizontal(
    (name) => findBoardColEl(boardEl, name),
    leftName,
    rightName,
    applyOrder,
    "col-swapping"
  );
}

function ColMoreMenu({
  canLeft,
  canRight,
  canDelete,
  onMoveLeft,
  onMoveRight,
  onRename,
  onDelete,
}) {
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
    <div
      className={"col-more" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className="col-more-btn"
        title="Column options"
        aria-label="Column options"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="more" size={14} />
      </button>
      {open && (
        <div className="pop" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={!canLeft}
            onClick={() => run(onMoveLeft)}
          >
            <Icon name="arrowLeft" size={14} />
            Move left
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canRight}
            onClick={() => run(onMoveRight)}
          >
            <Icon name="arrowRight" size={14} />
            Move right
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onRename)}
          >
            <Icon name="pencil" size={14} />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={!canDelete}
            onClick={() => run(onDelete)}
          >
            <Icon name="Trash" size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function BoardCol({
  name,
  count,
  collapsed,
  editing,
  canLeft,
  canRight,
  canDelete,
  onToggleCollapse,
  onRename,
  onMove,
  onDelete,
  onBodyDblClick,
  children,
}) {
  const renameViaPrompt = async () => {
    const next = await askPrompt({
      title: "Rename column",
      defaultValue: name,
      confirmLabel: "Rename",
    });
    if (next == null) return;
    const trimmed = next.trim().replace(/,/g, " ");
    if (!trimmed || trimmed === name) return;
    onRename?.(name, trimmed);
  };

  if (editing) {
    return (
      <div className="col" data-col={name}>
        <div className="col-head">
          <span className="col-name">{name}</span>
          <ColMoreMenu
            canLeft={canLeft}
            canRight={canRight}
            canDelete={canDelete}
            onMoveLeft={() => onMove?.(name, -1)}
            onMoveRight={() => onMove?.(name, 1)}
            onRename={renameViaPrompt}
            onDelete={() => onDelete?.(name)}
          />
        </div>
        <div className="col-body">
          {count > 0 && (
            <div
              className="col-phantom"
              title="Cards in this column move with it"
              aria-label={`${count} ${count === 1 ? "card" : "cards"}`}
            >
              <span className="col-phantom-back" aria-hidden="true" />
              <span className="col-phantom-front">
                {count} {count === 1 ? "card" : "cards"}
              </span>
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={"col" + (collapsed ? " collapsed" : "")} data-col={name}>
      <button
        type="button"
        className="col-head"
        title={collapsed ? "Expand column" : "Collapse column"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
      >
        <span className="col-count">{String(count)}</span>
        <span className="col-name">{name}</span>
      </button>
      {!collapsed && (
        <div
          className="col-body"
          onDoubleClick={(e) => {
            if (e.target.closest(".card,.day-group")) return;
            onBodyDblClick?.(e);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ProjectBoard({
  data,
  folder,
  mod,
  stages,
  boardEdit,
  colCollapsed,
  completedViewByScope,
  boardShowByScope,
  uiTick,
  activeTimerKey = null,
  onBumpCollapse,
  onSetCompletedView,
  onSaveCard,
  onOpenCard,
  onToggleDone,
  onStartNewCard,
  onApplyWorkspace,
  keepNav,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
  readonly = false,
}) {
  const scope = boardKey(folder, mod);
  const mode = getCompletedView(scope, completedViewByScope);
  const show = getBoardShow(scope, boardShowByScope);
  const spentByKey = useCardSpentByKey(show.timeSpent, uiTick);

  const resolveDrop = useCallback(
    async (payload, hint) => {
      if (!hint || boardEdit) return;
      const row = payload.row || payload;
      if (!row?.slug) return;

      if (hint.done) {
        if (isDone(row)) return;
        row.doneAt = new Date().toISOString();
        playTaskCompleteSound();
        onBumpCollapse();
        await onSaveCard(row, folder, mod);
        return;
      }

      const targetCol = hint.column;
      if (!targetCol) return;

      const openInTarget = byOrd(
        (data.rows || []).filter((r) => r.s === targetCol && !isDone(r))
      );
      const without = openInTarget.filter((r) => r !== row);
      const index = Math.max(0, Math.min(hint.index ?? without.length, without.length));
      const sameCol = row.s === targetCol && !isDone(row);
      if (sameCol) {
        const oldIndex = openInTarget.indexOf(row);
        if (oldIndex === index) return;
      }

      const next = [...without.slice(0, index), row, ...without.slice(index)];
      row.s = targetCol;
      row.doneAt = "";
      const items = next.map((r, i) => {
        r.ord = i;
        return orderPayload(r, folder, mod, i);
      });
      onBumpCollapse();
      const res = await putCardOrder({ items });
      onApplyWorkspace(res, keepNav(folder.slug, mod[2].slug));
    },
    [
      boardEdit,
      data.rows,
      folder,
      mod,
      onApplyWorkspace,
      onBumpCollapse,
      onSaveCard,
      keepNav,
    ]
  );

  const { dragKey, dragHeight, dragPreview, previewElRef, dropHint, armDrag, consumeDragClick } =
    useBoardCardDrag(boardEdit, resolveDrop);

  const cardProps = {
    boardEdit,
    dragKey,
    onArmDrag: armDrag,
    consumeDragClick,
    onOpen: onOpenCard,
    onToggleDone,
    onStartPomo,
    onAddManualTimelog,
    onOpenTimelogs,
    readonly,
    showTimeSpent: show.timeSpent,
    activeTimerKey,
  };

  const cardSrc = (row) =>
    show.projectName ? boardColumnLabel(folder, mod, row.s) : null;

  const renameBoardColumn = async (from, to) => {
    const next = (to || "").trim().replace(/,/g, " ");
    if (!next || next === from) return;
    const nextCols = (mod[2].columns || []).slice();
    const i = nextCols.indexOf(from);
    if (i < 0) return;
    if (nextCols.includes(next)) {
      onBumpCollapse();
      return;
    }
    nextCols[i] = next;
    (mod[2].rows || []).forEach((r) => {
      if (r.s === from) r.s = next;
    });
    const oldKey = colCollapseKey(scope, from);
    if (colCollapsed.has(oldKey)) {
      colCollapsed.delete(oldKey);
      colCollapsed.add(colCollapseKey(scope, next));
    }
    const res = await putBoard({
      project: folder.slug,
      board: mod[2].slug,
      name: mod[1],
      columns: nextCols,
      rename: { from, to: next },
    });
    onApplyWorkspace(res, keepNav(folder.slug, mod[2].slug));
  };

  const addBoardColumn = async () => {
    const label = (
      (await askPrompt({
        title: "New column",
        placeholder: "Column name",
        confirmLabel: "Add",
      })) || ""
    )
      .trim()
      .replace(/,/g, " ");
    if (!label) return;
    const nextCols = (mod[2].columns || []).slice();
    if (nextCols.includes(label)) {
      alert("A column with that name already exists.");
      return;
    }
    nextCols.push(label);
    const res = await putBoard({
      project: folder.slug,
      board: mod[2].slug,
      name: mod[1],
      columns: nextCols,
    });
    onApplyWorkspace(res, keepNav(folder.slug, mod[2].slug));
  };

  const deleteBoardColumn = async (name) => {
    const nextCols = (mod[2].columns || []).slice();
    if (nextCols.length <= 1) return;
    const i = nextCols.indexOf(name);
    if (i < 0) return;
    const remaining = nextCols.filter((c) => c !== name);
    const target = remaining[0];
    const count = (mod[2].rows || []).filter((r) => r.s === name).length;
    if (!(await confirmDeleteColumn(name, count, target))) return;
    nextCols.splice(i, 1);
    (mod[2].rows || []).forEach((r) => {
      if (r.s === name) r.s = target;
    });
    colCollapsed.delete(colCollapseKey(scope, name));
    const res = await putBoard({
      project: folder.slug,
      board: mod[2].slug,
      name: mod[1],
      columns: nextCols,
      rename: { from: name, to: target },
    });
    onApplyWorkspace(res, keepNav(folder.slug, mod[2].slug));
  };

  const moveBoardColumn = async (nextCols) => {
    const res = await putBoard({
      project: folder.slug,
      board: mod[2].slug,
      name: mod[1],
      columns: nextCols,
    });
    onApplyWorkspace(res, keepNav(folder.slug, mod[2].slug));
  };

  const boardRef = useRef(null);
  const swappingRef = useRef(false);
  const [editOrder, setEditOrder] = useState(null);
  const sourceCols = data.columns || stages;
  const sourceKey = sourceCols.join("\0");
  const cols = editOrder || sourceCols;

  useEffect(() => {
    if (!boardEdit) {
      setEditOrder(null);
      return;
    }
    if (swappingRef.current) return;
    setEditOrder(sourceCols.slice());
  }, [boardEdit, sourceKey, sourceCols]);

  const moveBoardColumnAnimated = (name, dir) => {
    if (swappingRef.current || !boardEdit) return;
    const list = cols.slice();
    const i = list.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const leftName = dir > 0 ? name : list[j];
    const rightName = dir > 0 ? list[j] : name;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    swappingRef.current = true;
    flipSwapColumns(boardRef.current, leftName, rightName, () => {
      setEditOrder(next);
    });
    moveBoardColumn(next).finally(() => {
      window.setTimeout(() => {
        swappingRef.current = false;
      }, 320);
    });
  };

  return (
    <div
      className={"board" + (boardEdit ? " editing" : "")}
      ref={boardRef}
    >
      <DragPreview preview={dragPreview} previewElRef={previewElRef} />
      {cols.map((s, i) => {
        const colRows = (data.rows || []).filter((r) => r.s === s);
        const split = columnRows(colRows, mode);
        const key = colCollapseKey(scope, s);
        const collapsed = !boardEdit && colCollapsed.has(key);
        const openItems = split.open.map((r) => ({
          key: r.slug || r.n,
          dragKey: cardDragKey(r, folder, mod),
          row: r,
        }));
        return (
          <BoardCol
            key={s}
            name={s}
            count={boardEdit ? colRows.length : split.all.length}
            collapsed={collapsed}
            editing={boardEdit}
            canLeft={i > 0}
            canRight={i < cols.length - 1}
            canDelete={cols.length > 1}
            onToggleCollapse={() => {
              if (colCollapsed.has(key)) colCollapsed.delete(key);
              else colCollapsed.add(key);
              onBumpCollapse();
            }}
            onRename={renameBoardColumn}
            onMove={moveBoardColumnAnimated}
            onDelete={deleteBoardColumn}
            onBodyDblClick={
              boardEdit
                ? undefined
                : () => onStartNewCard(folder, mod, { status: s, master: stages[0] })
            }
          >
            {!boardEdit &&
              renderOpenCards(
                openItems,
                s,
                dropHint,
                dragHeight,
                dragKey,
                (item) => (
                  <TaskCard
                    row={item.row}
                    folder={folder}
                    mod={mod}
                    src={cardSrc(item.row)}
                    spentSec={cardSpentSec(spentByKey, folder, mod, item.row)}
                    {...cardProps}
                  />
                )
              )}
            {!boardEdit &&
              mode === "inplace" &&
              split.done.length > 0 &&
              fillDoneGroups(
                split.done.map((row) => ({
                  row,
                  folder,
                  mod,
                  color: folder.color || PC[0],
                  src: cardSrc(row),
                  spentSec: cardSpentSec(spentByKey, folder, mod, row),
                  dragPayload: { row, folder, mod },
                })),
                { showEmpty: false },
                cardProps
              )}
          </BoardCol>
        );
      })}
      {boardEdit && (
        <div className="col col-add-slot">
          <div className="col-head">
            <button type="button" className="col-add" onClick={addBoardColumn}>
              + Add column
            </button>
          </div>
          <div className="col-body" />
        </div>
      )}
      {mode === "virtual" && !boardEdit && (
        <div className="col done-col">
          <button type="button" className="col-head" disabled>
            <span className="col-count">
              {(data.rows || []).filter(isDone).length}
            </span>
            <span className="col-name">Completed</span>
          </button>
          <div className="col-body">
            {fillDoneGroups(
              (data.rows || []).filter(isDone).map((row) => ({
                row,
                folder,
                mod,
                color: folder.color || PC[0],
                src: cardSrc(row),
                spentSec: cardSpentSec(spentByKey, folder, mod, row),
                dragPayload: { row, folder, mod },
              })),
              {},
              cardProps
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MasterBoard({
  folders,
  stages,
  boardEdit,
  masterOff,
  colCollapsed,
  completedViewByScope,
  boardShowByScope,
  uiTick,
  activeTimerKey = null,
  onBump,
  onSetCompletedView,
  onSaveCard,
  onOpenCard,
  onToggleDone,
  onStartNewCard,
  onApplyWorkspace,
  locateRow,
  currentFolder,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
}) {
  const tasks = allBoardTasks(folders).filter(
    (t) => !masterOff.has(boardKey(t.folder, t.mod))
  );
  const mode = getCompletedView("master", completedViewByScope);
  const show = getBoardShow("master", boardShowByScope);
  const spentByKey = useCardSpentByKey(show.timeSpent, uiTick);
  const cardSrc = (t) =>
    show.projectName ? boardColumnLabel(t.folder, t.mod, t.row.s) : null;

  const resolveDrop = useCallback(
    async (payload, hint) => {
      if (!hint || boardEdit) return;
      const row = payload.row || payload;
      const loc = payload.folder
        ? { folder: payload.folder, mod: payload.mod }
        : locateRow(row);
      if (!row?.slug || !loc) return;

      if (hint.done) {
        if (isDone(row)) return;
        row.doneAt = new Date().toISOString();
        playTaskCompleteSound();
        onBump();
        await onSaveCard(row, loc.folder, loc.mod);
        return;
      }

      const targetCol = hint.column;
      if (!targetCol) return;

      const openTasks = byOrd(
        tasks
          .filter((t) => t.row.ms === targetCol && !isDone(t.row))
          .map((t) => t.row)
      )
        .map((r) => tasks.find((t) => t.row === r))
        .filter(Boolean);

      const without = openTasks.filter((t) => t.row !== row);
      const index = Math.max(0, Math.min(hint.index ?? without.length, without.length));
      const sameCol = row.ms === targetCol && !isDone(row);
      if (sameCol) {
        const oldIndex = openTasks.findIndex((t) => t.row === row);
        if (oldIndex === index) return;
      }

      const dragTask = payload.folder
        ? payload
        : { row, folder: loc.folder, mod: loc.mod };
      const next = [...without.slice(0, index), dragTask, ...without.slice(index)];
      row.ms = targetCol;
      row.doneAt = "";
      const items = next.map((t, i) => {
        t.row.ord = i;
        return orderPayload(t.row, t.folder, t.mod, i);
      });
      onBump();
      const res = await putCardOrder({ items });
      onApplyWorkspace(res);
    },
    [boardEdit, tasks, locateRow, onBump, onSaveCard, onApplyWorkspace]
  );

  const { dragKey, dragHeight, dragPreview, previewElRef, dropHint, armDrag, consumeDragClick } =
    useBoardCardDrag(boardEdit, resolveDrop);

  const cardProps = {
    boardEdit,
    dragKey,
    onArmDrag: armDrag,
    consumeDragClick,
    onOpen: onOpenCard,
    onToggleDone,
    onStartPomo,
    onAddManualTimelog,
    onOpenTimelogs,
    showTimeSpent: show.timeSpent,
    activeTimerKey,
  };

  const renameMasterColumn = async (from, to) => {
    const next = (to || "").trim().replace(/,/g, " ");
    if (!next || next === from) return;
    const cols = stages.slice();
    const i = cols.indexOf(from);
    if (i < 0) return;
    if (cols.includes(next)) {
      onBump();
      return;
    }
    cols[i] = next;
    allBoardTasks(folders).forEach((t) => {
      if (t.row.ms === from) t.row.ms = next;
    });
    const oldKey = colCollapseKey("master", from);
    if (colCollapsed.has(oldKey)) {
      colCollapsed.delete(oldKey);
      colCollapsed.add(colCollapseKey("master", next));
    }
    const res = await putMasterboard({ columns: cols, rename: { from, to: next } });
    onApplyWorkspace(res);
  };

  const addMasterColumn = async () => {
    const label = (
      (await askPrompt({
        title: "New column",
        placeholder: "Column name",
        confirmLabel: "Add",
      })) || ""
    )
      .trim()
      .replace(/,/g, " ");
    if (!label) return;
    const cols = stages.slice();
    if (cols.includes(label)) {
      alert("A column with that name already exists.");
      return;
    }
    cols.push(label);
    const res = await putMasterboard({ columns: cols });
    onApplyWorkspace(res);
  };

  const deleteMasterColumn = async (name) => {
    const cols = stages.slice();
    if (cols.length <= 1) return;
    const i = cols.indexOf(name);
    if (i < 0) return;
    const remaining = cols.filter((c) => c !== name);
    const target = remaining[0];
    const count = allBoardTasks(folders).filter((t) => t.row.ms === name).length;
    if (!(await confirmDeleteColumn(name, count, target))) return;
    cols.splice(i, 1);
    allBoardTasks(folders).forEach((t) => {
      if (t.row.ms === name) t.row.ms = target;
    });
    colCollapsed.delete(colCollapseKey("master", name));
    const res = await putMasterboard({
      columns: cols,
      rename: { from: name, to: target },
    });
    onApplyWorkspace(res);
  };

  const moveMasterColumn = async (nextCols) => {
    const res = await putMasterboard({ columns: nextCols });
    onApplyWorkspace(res);
  };

  const boardRef = useRef(null);
  const swappingRef = useRef(false);
  const [editOrder, setEditOrder] = useState(null);
  const sourceKey = stages.join("\0");
  const cols = editOrder || stages;

  useEffect(() => {
    if (!boardEdit) {
      setEditOrder(null);
      return;
    }
    if (swappingRef.current) return;
    setEditOrder(stages.slice());
  }, [boardEdit, sourceKey, stages]);

  const moveMasterColumnAnimated = (name, dir) => {
    if (swappingRef.current || !boardEdit) return;
    const list = cols.slice();
    const i = list.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const leftName = dir > 0 ? name : list[j];
    const rightName = dir > 0 ? list[j] : name;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    swappingRef.current = true;
    flipSwapColumns(boardRef.current, leftName, rightName, () => {
      setEditOrder(next);
    });
    moveMasterColumn(next).finally(() => {
      window.setTimeout(() => {
        swappingRef.current = false;
      }, 320);
    });
  };

  const masterCreateTarget = () => {
    const boards = allBoards(folders).filter((b) => !masterOff.has(b.key));
    if (!boards.length) return null;
    return boards.find((b) => b.folder === currentFolder) || boards[0];
  };

  return (
    <div className="mb">
      <div
        className={"board" + (boardEdit ? " editing" : "")}
        ref={boardRef}
      >
        <DragPreview preview={dragPreview} previewElRef={previewElRef} />
        {cols.map((s, i) => {
          const stageTasks = tasks.filter((t) => t.row.ms === s);
          const split = columnRows(
            stageTasks.map((t) => t.row),
            mode
          );
          const byRow = (row) => stageTasks.find((t) => t.row === row);
          const open = split.open.map(byRow).filter(Boolean);
          const done = split.done.map(byRow).filter(Boolean);
          const key = colCollapseKey("master", s);
          const collapsed = !boardEdit && colCollapsed.has(key);
          const openItems = open.map((t) => ({
            key: (t.folder.slug || "") + "/" + (t.row.slug || t.row.n),
            dragKey: cardDragKey(t.row, t.folder, t.mod),
            task: t,
          }));
          return (
            <BoardCol
              key={s}
              name={s}
              count={boardEdit ? stageTasks.length : split.all.length}
              collapsed={collapsed}
              editing={boardEdit}
              canLeft={i > 0}
              canRight={i < cols.length - 1}
              canDelete={cols.length > 1}
              onToggleCollapse={() => {
                if (colCollapsed.has(key)) colCollapsed.delete(key);
                else colCollapsed.add(key);
                onBump();
              }}
              onRename={renameMasterColumn}
              onMove={moveMasterColumnAnimated}
              onDelete={deleteMasterColumn}
              onBodyDblClick={
                boardEdit
                  ? undefined
                  : () => {
                      const target = masterCreateTarget();
                      if (!target) {
                        alert(
                          "Enable at least one board in the footer to create a card."
                        );
                        return;
                      }
                      const boardStatus = (target.mod[2].columns || stages)[0];
                      onStartNewCard(target.folder, target.mod, {
                        status: boardStatus,
                        master: s,
                      });
                    }
              }
            >
              {!boardEdit &&
                renderOpenCards(
                  openItems,
                  s,
                  dropHint,
                  dragHeight,
                  dragKey,
                  (item) => {
                    const t = item.task;
                    return (
                      <TaskCard
                        row={t.row}
                        folder={t.folder}
                        mod={t.mod}
                        color={t.folder.color || PC[t.fi % PC.length]}
                        src={cardSrc(t)}
                        spentSec={cardSpentSec(spentByKey, t.folder, t.mod, t.row)}
                        dragPayload={t}
                        {...cardProps}
                      />
                    );
                  }
                )}
              {!boardEdit &&
                mode === "inplace" &&
                done.length > 0 &&
                fillDoneGroups(
                  done.map((t) => ({
                    row: t.row,
                    folder: t.folder,
                    mod: t.mod,
                    color: t.folder.color || PC[t.fi % PC.length],
                    src: cardSrc(t),
                    spentSec: cardSpentSec(spentByKey, t.folder, t.mod, t.row),
                    dragPayload: t,
                  })),
                  { showEmpty: false },
                  cardProps
                )}
            </BoardCol>
          );
        })}
        {boardEdit && (
          <div className="col col-add-slot">
            <div className="col-head">
              <button type="button" className="col-add" onClick={addMasterColumn}>
                + Add column
              </button>
            </div>
            <div className="col-body" />
          </div>
        )}
        {mode === "virtual" && !boardEdit && (
          <div className="col done-col">
            <button type="button" className="col-head" disabled>
              <span className="col-count">{tasks.filter((t) => isDone(t.row)).length}</span>
              <span className="col-name">Completed</span>
            </button>
            <div className="col-body">
              {fillDoneGroups(
                tasks
                  .filter((t) => isDone(t.row))
                  .map((t) => ({
                    row: t.row,
                    folder: t.folder,
                    mod: t.mod,
                    color: t.folder.color || PC[t.fi % PC.length],
                    src: cardSrc(t),
                    spentSec: cardSpentSec(spentByKey, t.folder, t.mod, t.row),
                    dragPayload: t,
                  })),
                {},
                cardProps
              )}
            </div>
          </div>
        )}
      </div>
      {!boardEdit && (
        <div className="mb-foot">
          {allBoards(folders).map(({ folder, mod, color, key }) => {
            const label = boardLabel(folder, mod);
            return (
              <button
                key={key}
                type="button"
                className={masterOff.has(key) ? "off" : ""}
                style={{ background: pastel(color) }}
                title={label}
                onClick={() => {
                  if (masterOff.has(key)) masterOff.delete(key);
                  else masterOff.add(key);
                  onBump();
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DbColHeader({
  col,
  canLeft,
  canRight,
  onMoveLeft,
  onMoveRight,
  onEdit,
}) {
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
    <th
      className={"db-col-th" + (open ? " open" : "")}
      ref={wrapRef}
      onClick={() => setOpen((o) => !o)}
    >
      <span className="db-col-lab">
        <Icon name={fieldTypeIcon(col.type)} size={14} />
        <span className="db-col-name">{col.label}</span>
        {col.required ? (
          <span className="db-req" title="Required">
            *
          </span>
        ) : null}
      </span>
      {open ? (
        <div
          className="pop db-col-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canLeft}
            onClick={() => run(onMoveLeft)}
          >
            <Icon name="arrowLeft" size={14} />
            Move left
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canRight}
            onClick={() => run(onMoveRight)}
          >
            <Icon name="arrowRight" size={14} />
            Move right
          </button>
          <button type="button" role="menuitem" onClick={() => run(onEdit)}>
            <Icon name="pencil" size={14} />
            Edit field
          </button>
        </div>
      ) : null}
    </th>
  );
}

async function persistDbColumns(folder, mod, cols) {
  const columns = cols.map(serializeDbCol).filter(Boolean);
  await putDatabase({
    project: folder.slug,
    database: mod[2].slug,
    name: mod[1],
    columns,
    customViews: normalizeCustomViews(mod[2].customViews),
    customViewId: resolveCustomViewId(mod[2].customViewId, mod[2].customViews),
  });
}

async function persistDbCustomViews(folder, mod) {
  await putDatabase({
    project: folder.slug,
    database: mod[2].slug,
    name: mod[1],
    columns: (mod[2].cols || []).map(serializeDbCol).filter(Boolean),
    customViews: normalizeCustomViews(mod[2].customViews),
    customViewId: resolveCustomViewId(mod[2].customViewId, mod[2].customViews),
  });
}

async function persistDbRow(folder, mod, row, cols) {
  const fields = {};
  cols.forEach((c) => {
    fields[c.id] = row[c.id] != null ? row[c.id] : emptyFieldValue(c);
  });
  await putItem({
    project: folder.slug,
    database: mod[2].slug,
    slug: row.slug,
    fields,
    body: row.body || "",
  });
}

function DbTable({
  d,
  folder,
  mod,
  stages,
  onOpen,
  onApplyWorkspace,
  displayRows,
  hiddenCols,
}) {
  const [editCol, setEditCol] = useState(null);
  const [editIsNew, setEditIsNew] = useState(false);
  const [, bump] = useState(0);
  const rows = displayRows || d.rows;
  const cols = visibleDbCols(d.cols, hiddenCols);

  const refresh = async () => {
    onApplyWorkspace(await fetchWorkspace());
  };

  const moveCol = async (index, dir) => {
    const next = index + dir;
    if (next < 0 || next >= d.cols.length) return;
    const list = d.cols.slice();
    const [item] = list.splice(index, 1);
    list.splice(next, 0, item);
    d.cols = list;
    await persistDbColumns(folder, mod, list);
    await refresh();
  };

  const saveCol = async (saved) => {
    const list = d.cols.slice();
    const idx = list.findIndex((c) => c.id === saved.id);
    if (editIsNew || idx < 0) {
      list.push(normalizeDbCol(saved));
      d.rows.forEach((r) => {
        if (r[saved.id] == null) r[saved.id] = emptyFieldValue(saved, stages);
      });
    } else {
      list[idx] = normalizeDbCol(saved);
    }
    d.cols = list;
    await persistDbColumns(folder, mod, list);
    for (const r of d.rows) {
      await persistDbRow(folder, mod, r, list);
    }
    setEditCol(null);
    setEditIsNew(false);
    await refresh();
  };

  const deleteCol = async (col) => {
    if (d.cols.length <= 1) return;
    const list = d.cols.filter((c) => c.id !== col.id);
    d.cols = list;
    d.rows.forEach((r) => {
      delete r[col.id];
    });
    await persistDbColumns(folder, mod, list);
    for (const r of d.rows) {
      await persistDbRow(folder, mod, r, list);
    }
    setEditCol(null);
    setEditIsNew(false);
    await refresh();
  };

  const setCell = async (row, col, next) => {
    row[col.id] = next;
    bump((n) => n + 1);
    await persistDbRow(folder, mod, row, d.cols);
  };

  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th className="db-enlarge-col" aria-hidden="true" />
            {cols.map((c) => {
              const i = d.cols.findIndex((col) => col.id === c.id);
              return (
                <DbColHeader
                  key={c.id}
                  col={c}
                  canLeft={i > 0}
                  canRight={i >= 0 && i < d.cols.length - 1}
                  onMoveLeft={() => moveCol(i, -1)}
                  onMoveRight={() => moveCol(i, 1)}
                  onEdit={() => {
                    setEditIsNew(false);
                    setEditCol(c);
                  }}
                />
              );
            })}
            <th
              className="addcol"
              onClick={() => {
                setEditIsNew(true);
                setEditCol({
                  id: "f" + Date.now(),
                  label: "",
                  type: "text",
                  required: false,
                });
              }}
            >
              + Add column
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <td className="db-enlarge-col">
                <button
                  type="button"
                  className="db-enlarge"
                  title="Open"
                  aria-label="Open entry"
                  onClick={() => onOpen(r, { folder, mod })}
                >
                  <Icon name="enlarge" size={14} />
                </button>
              </td>
              {cols.map((c) => (
                <td key={c.id} className={"db-td db-td-" + (c.type || "text")}>
                  <DbFieldInput
                    col={c}
                    value={r[c.id]}
                    stages={stages}
                    variant="cell"
                    onCommit={(next) => setCell(r, c, next)}
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
          <tr className="new">
            <td
              colSpan={cols.length + 2}
              onClick={async () => {
                const fields = {};
                d.cols.forEach((c) => {
                  fields[c.id] = emptyFieldValue(c, stages);
                });
                const data = await postItem({
                  project: folder.slug,
                  database: mod[2].slug,
                  fields,
                });
                onApplyWorkspace(data, {
                  project: folder.slug,
                  board: mod[2].slug,
                });
              }}
            >
              + New
            </td>
          </tr>
        </tbody>
      </table>
      {editCol ? (
        <FieldEditDialog
          col={editCol}
          isNew={editIsNew}
          canDelete={d.cols.length > 1 && !editIsNew}
          onClose={() => {
            setEditCol(null);
            setEditIsNew(false);
          }}
          onSave={saveCol}
          onDelete={deleteCol}
        />
      ) : null}
    </div>
  );
}

function DbGallery({ d, onOpen, displayRows }) {
  const rows = displayRows || d.rows;
  return (
    <div className="gallery">
      {rows.map((r) => (
        <div className="gcard" key={r.slug} onClick={() => onOpen(r)}>
          <div className="cover">{(r.n || "?")[0].toUpperCase()}</div>
          <b>{r.n || "Untitled"}</b>
          <span>{r.r || ""}</span>
          <em>{r.s || ""}</em>
        </div>
      ))}
    </div>
  );
}

function DbViewMoreMenu({ canDelete, onRename, onDelete }) {
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
    <div className={"db-view-more" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="db-view-more-btn"
        title="View options"
        aria-label="View options"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
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
            disabled={!canDelete}
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

export function DatabaseView({
  mod,
  folder,
  tabC,
  stages,
  onOpenCard,
  onApplyWorkspace,
}) {
  const scope = boardKey(folder, mod);
  const [showViews, setShowViews] = useState(
    () => !!loadDbViewsSidebar()[scope]
  );
  const [, bump] = useState(0);
  const persistTimer = useRef(null);
  const d = mod[2] || {
    cur: 0,
    views: [{ n: "Table", t: "table" }],
    cols: [],
    rows: [],
  };
  if (!d.cols) {
    d.cols = [
      { id: "n", label: "Name", type: "text" },
      { id: "r", label: "Role", type: "text" },
      { id: "s", label: "Stage", type: "stage" },
    ];
  }
  if (!d.views) d.views = [{ n: "Table", t: "table" }, { n: "Gallery", t: "gallery" }];
  if (d.cur >= d.views.length) d.cur = 0;
  d.customViews = normalizeCustomViews(d.customViews);
  d.customViewId = resolveCustomViewId(d.customViewId, d.customViews);

  const customViews = d.customViews;
  const activeView =
    customViews.find((v) => v.id === d.customViewId) || customViews[0];
  const filters = activeView.filters;
  const sorts = activeView.sorts;
  const hiddenCols = activeView.hiddenCols || [];

  useEffect(() => {
    setShowViews(!!loadDbViewsSidebar()[scope]);
  }, [scope]);

  useEffect(() => {
    return () => clearTimeout(persistTimer.current);
  }, []);

  const toggleViewsSidebar = () => {
    setShowViews((v) => {
      const next = !v;
      saveDbViewsSidebar(scope, next);
      return next;
    });
  };

  const schedulePersistViews = () => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistDbCustomViews(folder, mod).catch(() => {});
    }, 300);
  };

  const setFilters = (next) => {
    activeView.filters = next;
    d.customViews = normalizeCustomViews(customViews);
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const setHiddenCols = (next) => {
    activeView.hiddenCols = next;
    d.customViews = normalizeCustomViews(customViews);
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const setSorts = (next) => {
    activeView.sorts = next;
    d.customViews = normalizeCustomViews(customViews);
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const selectView = (id) => {
    if (id === d.customViewId) return;
    d.customViewId = resolveCustomViewId(id, customViews);
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const addView = () => {
    const view = createCustomView("Untitled view");
    d.customViews = normalizeCustomViews([...customViews, view]);
    d.customViewId = view.id;
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const renameView = async (view) => {
    const next = await askPrompt({
      title: "Rename view",
      defaultValue: view.name,
      confirmLabel: "Rename",
    });
    if (next == null) return;
    const name = next.trim() || view.name;
    if (name === view.name) return;
    view.name = name;
    d.customViews = normalizeCustomViews(customViews);
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const deleteView = async (view) => {
    if (isDefaultCustomView(view)) return;
    const ok = await askConfirm({
      title: `Delete "${view.name}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const next = customViews.filter((v) => v.id !== view.id);
    d.customViews = normalizeCustomViews(next);
    if (d.customViewId === view.id) d.customViewId = DEFAULT_VIEW_ID;
    d.customViewId = resolveCustomViewId(d.customViewId, d.customViews);
    bump((n) => n + 1);
    schedulePersistViews();
  };

  const displayRows = sortRows(
    filterRows(d.rows || [], filters, d.cols || []),
    sorts,
    d.cols || []
  );

  const addEntry = async () => {
    const fields = {};
    (d.cols || []).forEach((c) => {
      fields[c.id] = emptyFieldValue(c, stages);
    });
    const data = await postItem({
      project: folder.slug,
      database: mod[2].slug,
      fields,
    });
    const next = onApplyWorkspace(data, {
      project: folder.slug,
      board: mod[2].slug,
    });
    const nextFolder = next.find((f) => f.slug === folder.slug);
    const nextMod = nextFolder?.mods?.find((m) => m[2]?.slug === mod[2].slug);
    const row = nextMod?.[2]?.rows?.find((r) => r.slug === data.slug);
    if (row && nextFolder && nextMod) {
      onOpenCard(row, { folder: nextFolder, mod: nextMod });
    }
  };

  const main =
    d.views[d.cur].t === "gallery" ? (
      <DbGallery
        d={d}
        displayRows={displayRows}
        onOpen={(r) => onOpenCard(r, { folder, mod })}
      />
    ) : (
      <DbTable
        d={d}
        displayRows={displayRows}
        hiddenCols={hiddenCols}
        folder={folder}
        mod={mod}
        stages={stages}
        onOpen={onOpenCard}
        onApplyWorkspace={onApplyWorkspace}
      />
    );

  return (
    <div
      id="view"
      className="db"
      style={{ ["--tab"]: tabC, ["--tab-ink"]: "#fff" }}
    >
      <div className="modbar">
        <div className="modbar-start">
          <button
            type="button"
            className="mod-act"
            title="Add entry"
            aria-label="Add entry"
            onClick={addEntry}
          >
            <Icon name="plus" size={18} />
            <span className="mod-act-lab">Add entry</span>
          </button>
          <button
            type="button"
            className={"mod-act" + (showViews ? " on" : "")}
            title="Views"
            aria-label="Views"
            aria-pressed={showViews}
            onClick={toggleViewsSidebar}
          >
            <Icon name="sidebar" size={18} />
            <span className="mod-act-lab">Views</span>
          </button>
          <DbColumnsDropdown
            cols={d.cols || []}
            hiddenCols={hiddenCols}
            onChange={setHiddenCols}
          />
          <DbFiltersDropdown
            cols={d.cols || []}
            stages={stages}
            filters={filters}
            onChange={setFilters}
          />
          <DbSortsDropdown
            cols={d.cols || []}
            sorts={sorts}
            onChange={setSorts}
          />
        </div>
      </div>
      <div className="db-layout">
        {showViews ? (
          <aside className="db-sidebar" aria-label="Custom views">
            <div className="db-views-list">
              {customViews.map((view) => {
                const on = view.id === activeView.id;
                const locked = isDefaultCustomView(view);
                return (
                  <div
                    key={view.id}
                    className={"db-view-item" + (on ? " on" : "")}
                  >
                    <button
                      type="button"
                      className="db-view-select"
                      aria-current={on ? "true" : undefined}
                      onClick={() => selectView(view.id)}
                    >
                      <Icon name="eye" size={14} />
                      <span>{view.name}</span>
                    </button>
                    <DbViewMoreMenu
                      canDelete={!locked}
                      onRename={() => renameView(view)}
                      onDelete={() => deleteView(view)}
                    />
                  </div>
                );
              })}
            </div>
            <button type="button" className="db-views-add" onClick={addView}>
              <Icon name="plus" size={14} />
              Add view
            </button>
          </aside>
        ) : null}
        <div className="db-main">{main}</div>
      </div>
    </div>
  );
}

export default function Board({
  mode, // "project" | "master"
  mod,
  folder,
  folders,
  stages,
  tabC,
  readonly,
  boardEdit,
  onToggleBoardEdit,
  masterOff,
  colCollapsed,
  completedViewByScope,
  boardShowByScope,
  uiTick,
  onBump,
  onSetCompletedView,
  onSetBoardShow,
  onSaveCard,
  onOpenCard,
  onToggleDone,
  onStartNewCard,
  onApplyWorkspace,
  locateRow,
  keepNav,
  activeTimerKey = null,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
}) {
  if (mode === "master") {
    const addMasterTask = () => {
      const boards = allBoards(folders).filter((b) => !masterOff.has(b.key));
      if (!boards.length) {
        alert("Enable at least one board in the footer to create a card.");
        return;
      }
      const target = boards.find((b) => b.folder === folder) || boards[0];
      const boardStatus = (target.mod[2].columns || stages)[0];
      onStartNewCard(target.folder, target.mod, {
        status: boardStatus,
        master: stages[0],
      });
    };

    return (
      <div id="view" className="db" style={{ ["--tab"]: tabC }}>
        <GlobalBar name="Masterboard">
          {!boardEdit && (
            <button
              type="button"
              className="mod-act"
              title="Add task"
              aria-label="Add task"
              onClick={addMasterTask}
            >
              <Icon name="plus" size={18} />
              <span className="mod-act-lab">Add task</span>
            </button>
          )}
          {!boardEdit && (
            <CompletedViewBtn
              scope="master"
              completedViewByScope={completedViewByScope}
              boardShowByScope={boardShowByScope}
              onChange={onSetCompletedView}
              onSetBoardShow={onSetBoardShow}
              triggerLabel="View"
              align="right"
            />
          )}
          <BoardEditBtn boardEdit={boardEdit} onToggle={onToggleBoardEdit} />
        </GlobalBar>
        <MasterBoard
          folders={folders}
          stages={stages}
          boardEdit={boardEdit}
          masterOff={masterOff}
          colCollapsed={colCollapsed}
          completedViewByScope={completedViewByScope}
          boardShowByScope={boardShowByScope}
          uiTick={uiTick}
          onBump={onBump}
          onSetCompletedView={onSetCompletedView}
          onSaveCard={onSaveCard}
          onOpenCard={onOpenCard}
          onToggleDone={onToggleDone}
          onStartNewCard={onStartNewCard}
          onApplyWorkspace={onApplyWorkspace}
          locateRow={locateRow}
          currentFolder={folder}
          activeTimerKey={activeTimerKey}
          onStartPomo={onStartPomo}
          onAddManualTimelog={onAddManualTimelog}
          onOpenTimelogs={onOpenTimelogs}
        />
      </div>
    );
  }

  const editing = readonly ? false : boardEdit;
  const d = mod[2] || { rows: [], columns: stages.slice() };
  const scope = boardKey(folder, mod);

  return (
    <div id="view" className="db" style={{ ["--tab"]: tabC }}>
      <div className="modbar">
        <div className="modbar-start">
          {!readonly && !editing && (
            <button
              type="button"
              className="mod-act"
              title="Add task"
              aria-label="Add task"
              onClick={() =>
                onStartNewCard(folder, mod, {
                  status: (d.columns || stages)[0],
                  master: stages[0],
                })
              }
            >
              <Icon name="plus" size={18} />
              <span className="mod-act-lab">Add task</span>
            </button>
          )}
          {!editing && (
            <CompletedViewBtn
              scope={scope}
              completedViewByScope={completedViewByScope}
              boardShowByScope={boardShowByScope}
              onChange={onSetCompletedView}
              onSetBoardShow={onSetBoardShow}
              triggerLabel="View"
              align="left"
            />
          )}
        </div>
        {!readonly && (
          <BoardEditBtn boardEdit={editing} onToggle={onToggleBoardEdit} />
        )}
      </div>
      <ProjectBoard
        data={d}
        folder={folder}
        mod={mod}
        stages={stages}
        boardEdit={editing}
        colCollapsed={colCollapsed}
        completedViewByScope={completedViewByScope}
        boardShowByScope={boardShowByScope}
        uiTick={uiTick}
        onBumpCollapse={onBump}
        onSetCompletedView={onSetCompletedView}
        onSaveCard={onSaveCard}
        onOpenCard={onOpenCard}
        onToggleDone={onToggleDone}
        onStartNewCard={onStartNewCard}
        onApplyWorkspace={onApplyWorkspace}
        keepNav={keepNav}
        activeTimerKey={activeTimerKey}
        onStartPomo={onStartPomo}
        onAddManualTimelog={onAddManualTimelog}
        onOpenTimelogs={onOpenTimelogs}
        readonly={readonly}
      />
    </div>
  );
}
