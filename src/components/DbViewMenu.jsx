import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons.jsx";

/** Database View toolbar menu: sidebar toggle + flyout view switcher. */
export default function DbViewMenu({
  showViews,
  onToggleSidebar,
  customViews = [],
  activeViewId,
  onSelectView,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSwitchOpen(false);
      return;
    }
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      className={"mod-view-dd db-view-menu" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className={"mod-act" + (showViews ? " on" : "")}
        aria-label="View options"
        title="View options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="eye" size={18} />
        <span className="mod-act-lab">View</span>
      </button>
      {open ? (
        <div className="pop dd-menu db-view-menu-pop" role="menu">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showViews}
            className={"db-view-sidebar-item" + (showViews ? " on" : "")}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSidebar?.();
              setOpen(false);
            }}
          >
            <span className="db-view-check" aria-hidden="true">
              {showViews ? <Icon name="check" size={14} /> : null}
            </span>
            <span>Custom views sidebar</span>
          </button>
          <div
            className={"db-view-switch" + (switchOpen ? " open" : "")}
            role="none"
            onMouseEnter={() => setSwitchOpen(true)}
            onMouseLeave={() => setSwitchOpen(false)}
          >
            <button
              type="button"
              role="menuitem"
              className="db-view-switch-btn"
              aria-haspopup="menu"
              aria-expanded={switchOpen}
              tabIndex={-1}
            >
              <span>Switch custom view</span>
              <Icon name="arrow" size={12} />
            </button>
            {switchOpen ? (
              <div
                className="pop dd-menu db-view-switch-menu"
                role="menu"
                aria-label="Custom views"
              >
                {customViews.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={view.id === activeViewId}
                    className={view.id === activeViewId ? "on" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectView?.(view.id);
                      setOpen(false);
                    }}
                  >
                    {view.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
