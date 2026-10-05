import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  putItem,
  postItem,
  putDatabase,
  putBoard,
  putMasterboard,
  putCardOrder,
  fetchWorkspace,
} from "../api.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";
import { askPrompt } from "../promptDialog.js";
import {
  PC,
  STAGES,
  allBoardTasks,
  allBoards,
  boardKey,
  byOrd,
  colCollapseKey,
  columnRows,
  confirmDeleteColumn,
  groupByDoneDay,
  isDone,
  pastel,
  COMPLETED_VIEWS,
  loadCompletedViews,
} from "../utils.js";
import GlobalBar from "./GlobalBar.jsx";

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
            (folder && mod ? `${folder.name} · ${mod[1]}` : "");
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

export function TaskCard({
  row,
  folder,
  mod,
  color,
  src,
  boardEdit,
  noDrag,
  dragPayload,
  dragKey,
  cardKey,
  onArmDrag,
  consumeDragClick,
  onOpen,
  onToggleDone,
}) {
  const pc = color || folder?.color || PC[0];
  const done = isDone(row);
  const canDrag = !boardEdit && !noDrag;
  const key = cardKey || cardDragKey(row, folder, mod);
  const dragging = dragKey === key;
  return (
    <div
      className={"card tint" + (done ? " done" : "") + (dragging ? " dragging" : "")}
      style={{ ["--pc"]: pc, background: pastel(pc) }}
      onClick={() => {
        if (boardEdit) return;
        if (consumeDragClick?.()) return;
        onOpen(row);
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
        <span className="card-name">{row.n || "Untitled"}</span>
      </b>
      {src ? <span className="src">{src}</span> : null}
    </div>
  );
}

const COMPLETED_VIEW_OPTIONS = [
  { value: "hide", label: "Hide completed" },
  { value: "inplace", label: "Show completed tasks" },
  { value: "virtual", label: "Show completed column" },
];

function CompletedViewBtn({
  scope,
  completedViewByScope,
  onChange,
  triggerLabel,
  align = "right",
}) {
  const mode = getCompletedView(scope, completedViewByScope);
  const asViewMenu = Boolean(triggerLabel);
  return (
    <Dropdown
      className={asViewMenu ? "mod-view-dd" : "done-view-dd"}
      buttonClassName={asViewMenu ? "mod-act" : "done-view"}
      ariaLabel={asViewMenu ? "View options" : "Completed tasks view"}
      title={asViewMenu ? "View options" : "Completed tasks view"}
      align={align}
      value={mode}
      options={COMPLETED_VIEW_OPTIONS}
      onChange={(next) => {
        if (next === mode) return;
        onChange(scope, next);
      }}
    >
      {asViewMenu ? (
        <>
          <Icon name="gallery" size={14} />
          {triggerLabel}
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
      <Icon name={boardEdit ? "Task" : "pencil"} size={14} />
      {label}
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
  const leftEl = findBoardColEl(boardEl, leftName);
  const rightEl = findBoardColEl(boardEl, rightName);
  if (!leftEl || !rightEl) {
    applyOrder();
    return;
  }

  const firstLeft = leftEl.getBoundingClientRect();
  const firstRight = rightEl.getBoundingClientRect();

  flushSync(() => {
    applyOrder();
  });

  const leftAfter = findBoardColEl(boardEl, leftName);
  const rightAfter = findBoardColEl(boardEl, rightName);
  if (!leftAfter || !rightAfter) return;

  const lastLeft = leftAfter.getBoundingClientRect();
  const lastRight = rightAfter.getBoundingClientRect();
  const dxLeft = firstLeft.left - lastLeft.left;
  const dxRight = firstRight.left - lastRight.left;
  if (dxLeft === 0 && dxRight === 0) return;

  leftAfter.classList.add("col-swapping");
  rightAfter.classList.add("col-swapping");
  leftAfter.style.transition = "none";
  rightAfter.style.transition = "none";
  leftAfter.style.transform = `translateX(${dxLeft}px)`;
  rightAfter.style.transform = `translateX(${dxRight}px)`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      leftAfter.style.transition = "";
      rightAfter.style.transition = "";
      leftAfter.style.transform = "";
      rightAfter.style.transform = "";
      const cleanup = () => {
        leftAfter.classList.remove("col-swapping");
        rightAfter.classList.remove("col-swapping");
      };
      leftAfter.addEventListener("transitionend", cleanup, { once: true });
      window.setTimeout(cleanup, 380);
    });
  });
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
  onBumpCollapse,
  onSetCompletedView,
  onSaveCard,
  onOpenCard,
  onToggleDone,
  onStartNewCard,
  onApplyWorkspace,
  keepNav,
}) {
  const scope = boardKey(folder, mod);
  const mode = getCompletedView(scope, completedViewByScope);

  const resolveDrop = useCallback(
    async (payload, hint) => {
      if (!hint || boardEdit) return;
      const row = payload.row || payload;
      if (!row?.slug) return;

      if (hint.done) {
        if (isDone(row)) return;
        row.doneAt = new Date().toISOString();
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
  };

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
  onBump,
  onSetCompletedView,
  onSaveCard,
  onOpenCard,
  onToggleDone,
  onStartNewCard,
  onApplyWorkspace,
  locateRow,
  currentFolder,
}) {
  const tasks = allBoardTasks(folders).filter(
    (t) => !masterOff.has(boardKey(t.folder, t.mod))
  );
  const mode = getCompletedView("master", completedViewByScope);

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
                        src={t.folder.name + " · " + t.mod[1]}
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
                    src: t.folder.name + " · " + t.mod[1],
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
                    src: t.folder.name + " · " + t.mod[1],
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
            const label = `${folder.name} · ${mod[1]}`;
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

function DbTable({ d, folder, mod, stages, onOpen, onApplyWorkspace, setM, p, folders }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {d.cols.map((c) => (
              <th key={c.id}>{c.label}</th>
            ))}
            <th />
            <th
              className="addcol"
              onClick={async () => {
                const label = (
                  (await askPrompt({
                    title: "New column",
                    placeholder: "Column name",
                    confirmLabel: "Add",
                  })) || ""
                ).trim();
                if (!label) return;
                const id = "f" + Date.now();
                d.cols.push({ id, label, type: "text" });
                d.rows.forEach((r) => {
                  if (r[id] == null) r[id] = "";
                });
                await putDatabase({
                  project: folder.slug,
                  database: mod[2].slug,
                  name: mod[1],
                  columns: d.cols,
                });
                for (const r of d.rows) {
                  const fields = {};
                  d.cols.forEach((c) => {
                    fields[c.id] = r[c.id] != null ? r[c.id] : "";
                  });
                  await putItem({
                    project: folder.slug,
                    database: mod[2].slug,
                    slug: r.slug,
                    fields,
                    body: r.body || "",
                  });
                }
                onApplyWorkspace(await fetchWorkspace());
              }}
            >
              + Add column
            </th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.slug}>
              {d.cols.map((c) =>
                c.type === "stage" ? (
                  <td key={c.id}>
                    <Dropdown
                      className="table-dd"
                      value={r[c.id] || stages[0]}
                      options={stages}
                      onChange={async (next) => {
                        r[c.id] = next;
                        const fields = {};
                        d.cols.forEach((col) => {
                          fields[col.id] = r[col.id] != null ? r[col.id] : "";
                        });
                        await putItem({
                          project: folder.slug,
                          database: mod[2].slug,
                          slug: r.slug,
                          fields,
                          body: r.body || "",
                        });
                      }}
                    />
                  </td>
                ) : (
                  <td
                    key={c.id}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={async (e) => {
                      r[c.id] = e.currentTarget.textContent;
                      const fields = {};
                      d.cols.forEach((col) => {
                        fields[col.id] = r[col.id] != null ? r[col.id] : "";
                      });
                      await putItem({
                        project: folder.slug,
                        database: mod[2].slug,
                        slug: r.slug,
                        fields,
                        body: r.body || "",
                      });
                    }}
                  >
                    {r[c.id] ?? ""}
                  </td>
                )
              )}
              <td className="open">
                <button type="button" onClick={() => onOpen(r)}>
                  Open
                </button>
              </td>
              <td />
            </tr>
          ))}
          <tr className="new">
            <td
              colSpan={d.cols.length + 2}
              onClick={async () => {
                const fields = {};
                d.cols.forEach((c) => {
                  fields[c.id] = c.type === "stage" ? stages[0] : "";
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
    </div>
  );
}

function DbGallery({ d, onOpen }) {
  return (
    <div className="gallery">
      {d.rows.map((r) => (
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

export function DatabaseView({
  mod,
  folder,
  tabC,
  stages,
  onOpenCard,
  onApplyWorkspace,
}) {
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
  const [, bump] = useState(0);

  return (
    <div
      id="view"
      className="db"
      style={{ ["--tab"]: tabC, ["--tab-ink"]: "#fff" }}
    >
      <div className="vbar">
        {d.views.map((w, i) => (
          <button
            key={w.n + i}
            type="button"
            className={i === d.cur ? "on" : ""}
            onClick={() => {
              d.cur = i;
              bump((n) => n + 1);
            }}
          >
            {({ table: "▦ ", gallery: "▩ " })[w.t]}
            {w.n}
          </button>
        ))}
      </div>
      {d.views[d.cur].t === "gallery" ? (
        <DbGallery d={d} onOpen={onOpenCard} />
      ) : (
        <DbTable
          d={d}
          folder={folder}
          mod={mod}
          stages={stages}
          onOpen={onOpenCard}
          onApplyWorkspace={onApplyWorkspace}
        />
      )}
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
  uiTick,
  onBump,
  onSetCompletedView,
  onSaveCard,
  onOpenCard,
  onToggleDone,
  onStartNewCard,
  onApplyWorkspace,
  locateRow,
  keepNav,
}) {
  if (mode === "master") {
    return (
      <div id="view" className="db" style={{ ["--tab"]: tabC }}>
        <GlobalBar name="Masterboard">
          {!boardEdit && (
            <CompletedViewBtn
              scope="master"
              completedViewByScope={completedViewByScope}
              onChange={onSetCompletedView}
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
          onBump={onBump}
          onSetCompletedView={onSetCompletedView}
          onSaveCard={onSaveCard}
          onOpenCard={onOpenCard}
          onToggleDone={onToggleDone}
          onStartNewCard={onStartNewCard}
          onApplyWorkspace={onApplyWorkspace}
          locateRow={locateRow}
          currentFolder={folder}
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
              <Icon name="plus" size={14} />
              Add task
            </button>
          )}
          {!editing && (
            <CompletedViewBtn
              scope={scope}
              completedViewByScope={completedViewByScope}
              onChange={onSetCompletedView}
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
        onBumpCollapse={onBump}
        onSetCompletedView={onSetCompletedView}
        onSaveCard={onSaveCard}
        onOpenCard={onOpenCard}
        onToggleDone={onToggleDone}
        onStartNewCard={onStartNewCard}
        onApplyWorkspace={onApplyWorkspace}
        keepNav={keepNav}
      />
    </div>
  );
}
