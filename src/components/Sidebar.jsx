import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons.jsx";
import {
  GACC,
  MIN_TIMELOG_SEC,
  PC,
  formatTimer,
  globalLabel,
  isStoptimerSession,
  liveCardTitle,
  pomoElapsedSec,
  pomoRemainingSec,
} from "../utils.js";

const DRAG_THRESHOLD_PX = 6;

function findProjectDropIndex(clientY, container) {
  if (!container) return null;
  const items = [...container.querySelectorAll(":scope > .bm")];
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return items.length;
}

function SideDropShadow({ height }) {
  return (
    <div
      className="side-drop-shadow"
      aria-hidden="true"
      style={height ? { height } : undefined}
    />
  );
}

function ProjectDragPreview({ preview, previewElRef }) {
  if (!preview) return null;
  return createPortal(
    <div
      ref={previewElRef}
      className="bm side-drag-preview"
      style={{
        width: preview.width,
        height: preview.height,
        transform: `translate(${preview.x}px, ${preview.y}px)`,
      }}
      aria-hidden="true"
    >
      <span style={{ color: preview.color }}>
        <Icon name="folder" filled />
      </span>
      <span>{preview.label}</span>
    </div>,
    document.body
  );
}

function useProjectDrag(listRef, onReorder) {
  const [dragId, setDragId] = useState(null);
  const [dragHeight, setDragHeight] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const sessionRef = useRef(null);
  const dropRef = useRef(null);
  const movedRef = useRef(false);
  const previewElRef = useRef(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const setDrop = useCallback((index) => {
    dropRef.current = index;
    setDropIndex(index);
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
    setDragId(null);
    setDragHeight(null);
    setDragPreview(null);
    setDrop(null);
    document.body.classList.remove("is-project-dragging");
  }, [setDrop]);

  useEffect(() => () => cleanup(), [cleanup]);

  const armDrag = useCallback(
    (e, { id, label, color }) => {
      if (e.button !== 0) return;
      if (sessionRef.current) cleanup();

      movedRef.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      const session = {
        id,
        label,
        color,
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
          setDragId(session.id);
          setDragHeight(session.height);
          setDragPreview({
            width: session.width,
            height: session.height,
            color: session.color,
            label: session.label,
            x: ev.clientX - session.offsetX,
            y: ev.clientY - session.offsetY,
          });
          document.body.classList.add("is-project-dragging");
        } else {
          movePreview(ev.clientX, ev.clientY, session);
        }
        ev.preventDefault();
        setDrop(findProjectDropIndex(ev.clientY, listRef.current));
      };

      session.onUp = (ev) => {
        if (ev.pointerId !== session.pointerId) return;
        const started = session.started;
        const toIndex = dropRef.current;
        const fromId = session.id;
        cleanup();
        if (started && toIndex != null) onReorderRef.current?.(fromId, toIndex);
      };

      sessionRef.current = session;
      window.addEventListener("pointermove", session.onMove, { passive: false });
      window.addEventListener("pointerup", session.onUp);
      window.addEventListener("pointercancel", session.onUp);
    },
    [cleanup, listRef, movePreview, setDrop]
  );

  const consumeDragClick = useCallback(() => {
    if (!movedRef.current) return false;
    movedRef.current = false;
    return true;
  }, []);

  return {
    dragId,
    dragHeight,
    dragPreview,
    previewElRef,
    dropIndex,
    armDrag,
    consumeDragClick,
  };
}

export default function Sidebar({
  folders,
  p,
  g,
  draftProject,
  coverEdit,
  coverDraft,
  activePomo,
  workspaceItems,
  onSelectGlobal,
  onSelectProject,
  onAddProject,
  onReorderProjects,
  onStopPomo,
  onPomoNoteChange,
  onOpenPomoCard,
  onOpenSettings,
  updateAvailable,
  onOpenUpdate,
}) {
  const foldersRef = useRef(null);
  const active = folders.map((pr, i) => ({ pr, i })).filter((x) => !x.pr.archived);
  const globals = workspaceItems || [];

  const {
    dragId,
    dragHeight,
    dragPreview,
    previewElRef,
    dropIndex,
    armDrag,
    consumeDragClick,
  } = useProjectDrag(foldersRef, onReorderProjects);

  const visible = dragId
    ? active.filter(({ pr }) => pr.id !== dragId)
    : active;

  return (
    <aside>
      <div className="side-scroll">
        <h2>Workspace</h2>
        <div id="globals">
          {globals.map((n) => {
            const on = g === n;
            const rainbow = n === "Masterboard" && on;
            return (
              <button
                key={n}
                type="button"
                className={"bm" + (on ? " on" : "")}
                onClick={() => onSelectGlobal(n)}
              >
                <span style={rainbow ? undefined : { color: "var(--side-mute)" }}>
                  <Icon name={n} rainbow={rainbow} />
                </span>
                <span>{globalLabel(n)}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="bm"
            id="app-settings"
            title="Settings"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings?.();
            }}
          >
            <span style={{ color: "var(--side-mute)" }}>
              <Icon name="settings" />
            </span>
            <span>Settings</span>
          </button>
          {updateAvailable && (
            <button
              type="button"
              className="bm side-update"
              id="app-update"
              title="Update available"
              onClick={(e) => {
                e.stopPropagation();
                onOpenUpdate?.();
              }}
            >
              <span style={{ color: "var(--side-mute)" }}>
                <Icon name="arrow" />
              </span>
              <span>Update available</span>
            </button>
          )}
        </div>
        <div className="side-head">
          <h2>Projects</h2>
          <button
            type="button"
            className="side-add"
            id="add-project"
            title="New project"
            aria-label="New project"
            onClick={(e) => {
              e.stopPropagation();
              onAddProject();
            }}
          >
            +
          </button>
        </div>
        <div id="folders" ref={foldersRef}>
          {active.length === 0 && (
            <p className="side-empty">No projects yet</p>
          )}
          {visible.map(({ pr, i }, vi) => {
            const editingHere = coverEdit && coverDraft && i === p && !g && !draftProject;
            const icColor = editingHere
              ? coverDraft.color || pr.color
              : pr.color || PC[i % PC.length];
            const label = editingHere ? coverDraft.name || pr.name : pr.name;
            return (
              <Fragment key={pr.id}>
                {dragId && dropIndex === vi ? (
                  <SideDropShadow height={dragHeight} />
                ) : null}
                <button
                  type="button"
                  className={"bm" + (i === p && !g && !draftProject ? " on" : "")}
                  onPointerDown={(e) =>
                    armDrag(e, { id: pr.id, label, color: icColor })
                  }
                  onClick={() => {
                    if (consumeDragClick()) return;
                    onSelectProject(i);
                  }}
                >
                  <span style={{ color: icColor }}>
                    <Icon name="folder" filled />
                  </span>
                  <span>{label}</span>
                </button>
              </Fragment>
            );
          })}
          {dragId && dropIndex === visible.length ? (
            <SideDropShadow height={dragHeight} />
          ) : null}
        </div>
      </div>
      {activePomo ? (
        <div className="side-foot">
          <PomoBlock
            folders={folders}
            activePomo={activePomo}
            onStop={onStopPomo}
            onNoteChange={onPomoNoteChange}
            onOpenCard={onOpenPomoCard}
          />
        </div>
      ) : null}
      <ProjectDragPreview preview={dragPreview} previewElRef={previewElRef} />
    </aside>
  );
}

const POMO_NOTE_LINE = 1.35;
const POMO_NOTE_PAD_Y = 28;
const POMO_NOTE_MAX_LINES = 5;

function PomoBlock({ folders = [], activePomo, onStop, onNoteChange, onOpenCard }) {
  const stopwatch = isStoptimerSession(activePomo);
  const elapsed = pomoElapsedSec(activePomo);
  const shown = stopwatch ? elapsed : pomoRemainingSec(activePomo);
  const canSave = elapsed >= MIN_TIMELOG_SEC;
  const color = activePomo.color || GACC;
  const noteRef = useRef(null);
  const cardTitle = liveCardTitle(
    folders,
    activePomo.project,
    activePomo.board,
    activePomo.card,
    activePomo.title || "Untitled"
  );

  const resizeNote = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 12;
    const maxH = POMO_NOTE_MAX_LINES * POMO_NOTE_LINE * fs + POMO_NOTE_PAD_Y;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH + 1 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeNote();
  }, [activePomo.note, resizeNote]);

  return (
    <div
      className="pomo-block"
      id="pomo-block"
      style={{ ["--pc"]: color }}
    >
      <div className="pomo-body">
        <button
          type="button"
          className="pomo-mini"
          id="pomo-mini"
          title="Open card"
          onClick={onOpenCard}
        >
          <div className="pomo-time" id="pomo-time">
            {formatTimer(shown)}
          </div>
          <b className="pomo-card-title" id="pomo-card-title">
            {cardTitle}
          </b>
        </button>
        <textarea
          ref={noteRef}
          className="pomo-note"
          id="pomo-note"
          rows={1}
          placeholder="Add notes…"
          value={activePomo.note || ""}
          onChange={(e) => {
            onNoteChange?.(e.target.value);
            requestAnimationFrame(resizeNote);
          }}
        />
      </div>
      <button
        type="button"
        className={"pomo-stop" + (canSave ? "" : " is-cancel")}
        id="pomo-stop"
        onClick={onStop}
      >
        {canSave ? "Stop and save" : "Cancel"}
      </button>
    </div>
  );
}
