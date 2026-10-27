import { useEffect, useRef, useState } from "react";
import {
  EFFORT_LEVELS,
  IMPACT_LEVELS,
  normalizeEffort,
  normalizeImpact,
} from "../cardMeta.js";
import { Icon } from "../icons.jsx";
import { loadCountdownDurationMin, timelogTaskFromCard } from "../utils.js";
import { CardMetaIcon, CardMetaKindIcon } from "./CardTitleIcons.jsx";
import Dropdown from "./Dropdown.jsx";

/** ⋮ menu for a single timelog entry (Edit / Delete). Fixed pop escapes scroll/overflow clip. */
export function TimelogMoreMenu({ disabled, onEdit, onDelete, className = "" }) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuH = 88;
    const openUp = window.innerHeight - r.bottom < menuH + 8;
    setPos(
      openUp
        ? { bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right }
        : { top: r.bottom + 4, right: window.innerWidth - r.right }
    );
  };

  useEffect(() => {
    if (!open) {
      setPos(null);
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

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

  return (
    <div
      className={
        "timelog-more" + (open ? " open" : "") + (className ? ` ${className}` : "")
      }
      ref={wrapRef}
    >
      <button
        type="button"
        ref={btnRef}
        className="timelog-more-btn"
        title="Timelog options"
        aria-label="Timelog options"
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
          style={{
            top: pos.top,
            bottom: pos.bottom,
            right: pos.right,
            left: "auto",
          }}
        >
          <button type="button" role="menuitem" onClick={() => run(onEdit)}>
            <Icon name="pencil" size={14} />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => run(onDelete)}
          >
            <Icon name="Trash" size={14} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function timelogOptions({ showTimers = true } = {}) {
  const mins = loadCountdownDurationMin();
  return [
    ...(showTimers
      ? [
          {
            value: "pomo",
            label: `Start ${mins}m countdown`,
            icon: "hourglass",
          },
          { value: "stoptimer", label: "Start stopwatch", icon: "stopwatch" },
        ]
      : []),
    { value: "manual", label: "Add timelog manually", icon: "pencil" },
    { value: "logs", label: "Open in Timelogs...", icon: "list" },
  ];
}

export async function runTimelogAction(
  value,
  { folder, mod, row, onStartPomo, onAddManualTimelog, onOpenTimelogs }
) {
  if (!folder || !mod?.[2]?.id || !row?.id) return;
  const task = timelogTaskFromCard(folder, mod, row);

  if (value === "pomo" || value === "stoptimer") {
    await onStartPomo?.({
      ...task,
      kind: value === "stoptimer" ? "stoptimer" : "pomodoro",
    });
    return;
  }
  if (value === "manual") {
    await onAddManualTimelog?.(task);
    return;
  }
  if (value === "logs") {
    await onOpenTimelogs?.(task);
  }
}

export function TimelogMenuButtons({ options, onPick }) {
  return options.map((o) => (
    <button
      key={o.value}
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onPick(o.value);
      }}
    >
      <span className="dd-opt">
        <Icon name={o.icon} size={14} />
        {o.label}
      </span>
    </button>
  ));
}

/** Chip / button trigger (card dialog prop chip). */
export default function TimelogDropdown({
  folder,
  mod,
  row,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
  showTimers = true,
  className = "",
  buttonClassName = "",
  align = "left",
  ariaLabel = "Timelog",
  title = "Timelog",
  caret = false,
  children,
  onAfterAction,
}) {
  const options = timelogOptions({ showTimers });
  return (
    <Dropdown
      className={className}
      buttonClassName={buttonClassName}
      align={align}
      ariaLabel={ariaLabel}
      title={title}
      caret={caret}
      options={options}
      onChange={async (v) => {
        await runTimelogAction(v, {
          folder,
          mod,
          row,
          onStartPomo,
          onAddManualTimelog,
          onOpenTimelogs,
        });
        await onAfterAction?.(v);
      }}
    >
      {children}
    </Dropdown>
  );
}

function clampMenuPos(left, top, menuEl) {
  const pad = 8;
  const w = menuEl?.offsetWidth || 180;
  const h = menuEl?.offsetHeight || 160;
  return {
    left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
    top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
  };
}

/** Nested level picker (Effort / Impact) inside the Add flyout. */
function CardCtxAddLevelSub({ kind, onPick }) {
  const levels = kind === "impact" ? IMPACT_LEVELS : EFFORT_LEVELS;
  const label = kind === "impact" ? "Impact" : "Effort";
  return (
    <div className="card-ctx-add-sub">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        className="card-ctx-add-sub-trigger"
        onClick={(e) => e.stopPropagation()}
      >
        <CardMetaKindIcon kind={kind} size={18} />
        <span className="card-ctx-add-lab">{label}</span>
        <span className="card-ctx-add-caret" aria-hidden="true">
          <Icon name="arrow" size={12} />
        </span>
      </button>
      <div className="pop card-ctx-add-sub-menu" role="menu" aria-label={label}>
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onPick?.(level);
            }}
          >
            <span className="dd-opt">
              <CardMetaIcon kind={kind} level={level} size={18} decorative />
              {level}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Add → Effort / Impact / File (only options that are still missing / allowed). */
function CardCtxAddFlyout({
  canAddEffort,
  canAddImpact,
  canAddFile,
  onAddEffort,
  onAddImpact,
  onAddFile,
}) {
  const leaveTimer = useRef(0);
  const [open, setOpen] = useState(false);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  if (!canAddEffort && !canAddImpact && !canAddFile) return null;

  const show = () => {
    window.clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="dd-section" role="group" aria-label="Add">
      <div
        className={"card-ctx-add" + (open ? " open" : "")}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <button
          type="button"
          role="menuitem"
          className="card-ctx-add-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            window.clearTimeout(leaveTimer.current);
            setOpen((o) => !o);
          }}
        >
          <Icon name="plus" size={14} />
          <span className="card-ctx-add-lab">Add</span>
          <span className="card-ctx-add-caret" aria-hidden="true">
            <Icon name="arrow" size={12} />
          </span>
        </button>
        {open ? (
          <div className="pop card-ctx-add-pop" role="menu" aria-label="Add">
            {canAddFile ? (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFile?.();
                }}
              >
                <span className="dd-opt">
                  <Icon name="Files" size={14} />
                  File
                </span>
              </button>
            ) : null}
            {canAddEffort ? (
              <CardCtxAddLevelSub kind="effort" onPick={onAddEffort} />
            ) : null}
            {canAddImpact ? (
              <CardCtxAddLevelSub kind="impact" onPick={onAddImpact} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Fixed-position menu for card right-click. */
export function TimelogContextMenu({
  left,
  top,
  folder,
  mod,
  row,
  onStartPomo,
  onAddManualTimelog,
  onOpenTimelogs,
  onAddEffort,
  onAddImpact,
  onAddFile,
  onDuplicate,
  onDelete,
  showTimers = true,
  onClose,
}) {
  const wrapRef = useRef(null);
  const [pos, setPos] = useState({ left, top });
  const options = timelogOptions({ showTimers });
  const canOrganise = !!(onDuplicate || onDelete);
  const canAddEffort =
    typeof onAddEffort === "function" && !normalizeEffort(row?.effort);
  const canAddImpact =
    typeof onAddImpact === "function" && !normalizeImpact(row?.impact);
  const canAddFile = typeof onAddFile === "function";

  useEffect(() => {
    setPos(clampMenuPos(left, top, wrapRef.current));
  }, [left, top]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = async (fn) => {
    onClose?.();
    await fn?.();
  };

  return (
    <div
      ref={wrapRef}
      className="pop dd-menu card-timelog-menu"
      role="menu"
      aria-label="Task options"
      style={{ display: "block", left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="dd-section" role="group" aria-label="Timelogs">
        <div className="dd-heading">Timelogs</div>
        <TimelogMenuButtons
          options={options}
          onPick={(v) =>
            run(() =>
              runTimelogAction(v, {
                folder,
                mod,
                row,
                onStartPomo,
                onAddManualTimelog,
                onOpenTimelogs,
              })
            )
          }
        />
      </div>
      <CardCtxAddFlyout
        canAddEffort={canAddEffort}
        canAddImpact={canAddImpact}
        canAddFile={canAddFile}
        onAddEffort={(level) => run(() => onAddEffort?.(level))}
        onAddImpact={(level) => run(() => onAddImpact?.(level))}
        onAddFile={() => run(() => onAddFile?.())}
      />
      {canOrganise ? (
        <div className="dd-section" role="group" aria-label="Organise">
          <div className="dd-heading">Organise</div>
          {onDuplicate ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                run(onDuplicate);
              }}
            >
              <span className="dd-opt">
                <Icon name="copy" size={14} />
                Duplicate task
              </span>
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={(e) => {
                e.stopPropagation();
                run(onDelete);
              }}
            >
              <span className="dd-opt">
                <Icon name="Trash" size={14} />
                Delete task
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
