import { useState } from "react";
import { Icon, IC } from "../icons.jsx";
import {
  PC,
  WORKSPACE_ITEMS,
  globalLabel,
  isProjectArchived,
} from "../utils.js";

export default function MobileGlobalBar({
  name,
  titleRainbow = false,
  folders = [],
  onOpenSettings,
  children,
}) {
  const [open, setOpen] = useState(false);
  const active = folders.filter((pr) => !isProjectArchived(pr));

  const openSettings = () => {
    setOpen(false);
    onOpenSettings?.();
  };

  return (
    <>
      <div className="modbar gbar">
        <button
          type="button"
          className={"gbar-title gbar-title-btn" + (open ? " is-open" : "")}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
        >
          <span>
            <Icon name={name} rainbow={titleRainbow} />
          </span>
          <b>{globalLabel(name)}</b>
          <span className="dd-caret" aria-hidden="true">
            <Icon name="caret" size={12} />
          </span>
        </button>
        {children ? <div className="gbar-tools">{children}</div> : null}
      </div>
      <div
        className={"mobile-nav-ov" + (open ? " is-open" : "")}
        aria-hidden={!open}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div
          className="mobile-nav-sheet"
          role="dialog"
          aria-label="Navigate"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mobile-nav-sheet-inner">
            <div className="mobile-nav-sec">
              <h2>Workspace</h2>
              <div className="mobile-nav-list">
                {WORKSPACE_ITEMS.map((n) => {
                  const on = n === name;
                  const rainbow = n === "Masterboard" && on;
                  return (
                    <div
                      key={n}
                      className={"mobile-nav-row" + (on ? " on" : "")}
                      aria-disabled="true"
                    >
                      <span
                        style={rainbow ? undefined : { color: "var(--mute)" }}
                      >
                        <Icon name={n} rainbow={rainbow} />
                      </span>
                      <span>{globalLabel(n)}</span>
                    </div>
                  );
                })}
                {onOpenSettings ? (
                  <button
                    type="button"
                    className="mobile-nav-row mobile-nav-row-btn"
                    onClick={openSettings}
                  >
                    <span style={{ color: "var(--mute)" }}>
                      <Icon name="settings" />
                    </span>
                    <span>Settings</span>
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mobile-nav-sec">
              <h2>Projects</h2>
              <div className="mobile-nav-list">
                {active.length === 0 ? (
                  <div className="mobile-nav-empty">No projects yet</div>
                ) : (
                  active.map((pr, i) => {
                    const color = pr.color || PC[i % PC.length];
                    const mods = pr.mods || [];
                    return (
                      <div key={pr.id || i} className="mobile-nav-project">
                        <div
                          className="mobile-nav-row mobile-nav-project-head"
                          aria-disabled="true"
                        >
                          <span style={{ color }}>
                            <Icon name="folder" filled />
                          </span>
                          <span>{pr.name}</span>
                        </div>
                        {mods.map((mod, mi) => {
                          const type = mod?.[0];
                          const label = mod?.[1] || type || "Tab";
                          return (
                            <div
                              key={mod?.[2]?.id || `${pr.id}-${mi}`}
                              className="mobile-nav-row mobile-nav-mod"
                              aria-disabled="true"
                            >
                              {type && IC[type] ? (
                                <span style={{ color }}>
                                  <Icon name={type} />
                                </span>
                              ) : (
                                <span />
                              )}
                              <span>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
