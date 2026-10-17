import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons.jsx";

function clampMenuPos(left, top, menuEl) {
  const pad = 8;
  const w = menuEl?.offsetWidth || 180;
  const h = menuEl?.offsetHeight || 120;
  return {
    left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
    top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
  };
}

/** Shared Duplicate / Delete items for record organise + context menus. */
export function DbRecordMenuItems({ onDuplicate, onDelete, onRun }) {
  const run = (fn) => {
    onRun?.(fn);
  };
  return (
    <>
      {onDuplicate ? (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            run(onDuplicate);
          }}
        >
          <Icon name="copy" size={14} />
          Duplicate
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
          <Icon name="Trash" size={14} />
          Delete
        </button>
      ) : null}
    </>
  );
}

/** Organise ⋯ control beside the Name value in the record dialog. */
export function DbOrganiseMenu({ onDuplicate, onDelete }) {
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

  return (
    <div className={"db-organise" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className="db-organise-btn"
        title="Organise"
        aria-label="Organise"
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
        <div className="pop db-organise-menu" role="menu">
          <DbRecordMenuItems
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onRun={(fn) => {
              setOpen(false);
              fn?.();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Fixed-position menu for database table row right-click. */
export function DbRecordContextMenu({
  left,
  top,
  onDuplicate,
  onDelete,
  onClose,
}) {
  const wrapRef = useRef(null);
  const [pos, setPos] = useState({ left, top });

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

  return createPortal(
    <div
      ref={wrapRef}
      className="pop dd-menu db-record-ctx-menu"
      role="menu"
      aria-label="Record options"
      style={{ display: "block", left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <DbRecordMenuItems
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onRun={(fn) => {
          onClose?.();
          fn?.();
        }}
      />
    </div>,
    document.body
  );
}
