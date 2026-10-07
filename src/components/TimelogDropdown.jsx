import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons.jsx";
import { PC } from "../utils.js";
import Dropdown from "./Dropdown.jsx";

function timelogOptions({ showTimers = true } = {}) {
  return [
    ...(showTimers
      ? [
          { value: "pomo", label: "Start pomodoro", icon: "tomato" },
          { value: "stoptimer", label: "Start stopwatch", icon: "stopwatch" },
        ]
      : []),
    { value: "manual", label: "Add manually", icon: "pencil" },
    { value: "logs", label: "Open timelogs...", icon: "list" },
  ];
}

function taskTimelogFilter(folder, mod, row) {
  return {
    project: folder.slug,
    board: mod[2].slug,
    card: row.slug,
    title: row.n || "Untitled",
  };
}

async function runTimelogAction(
  value,
  { folder, mod, row, onStartPomo, onAddManualTimelog, onOpenTimelogs }
) {
  if (!folder || !mod?.[2]?.slug || !row?.slug) return;
  const filter = taskTimelogFilter(folder, mod, row);

  if (value === "pomo" || value === "stoptimer") {
    await onStartPomo?.({
      ...filter,
      projectName: folder.name,
      boardName: mod[1],
      color: folder.color || PC[0],
      kind: value === "stoptimer" ? "stoptimer" : "pomodoro",
    });
    return;
  }
  if (value === "manual") {
    await onAddManualTimelog?.(filter);
    return;
  }
  if (value === "logs") {
    await onOpenTimelogs?.(filter);
  }
}

function MenuButtons({ options, onPick }) {
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
  showTimers = true,
  onClose,
}) {
  const wrapRef = useRef(null);
  const [pos, setPos] = useState({ left, top });
  const options = timelogOptions({ showTimers });

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

  return (
    <div
      ref={wrapRef}
      className="pop dd-menu card-timelog-menu"
      role="menu"
      aria-label="Timelog"
      style={{ display: "block", left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <MenuButtons
        options={options}
        onPick={async (v) => {
          onClose?.();
          await runTimelogAction(v, {
            folder,
            mod,
            row,
            onStartPomo,
            onAddManualTimelog,
            onOpenTimelogs,
          });
        }}
      />
    </div>
  );
}
