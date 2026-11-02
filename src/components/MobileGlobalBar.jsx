import { useState } from "react";
import { Icon, IC } from "../icons.jsx";
import {
  PC,
  WORKSPACE_ITEMS,
  globalLabel,
  isProjectArchived,
} from "../utils.js";
import Dropdown from "./Dropdown.jsx";

/** Share / Archive / Delete (no Edit) for the read-only mobile cover. */
export function MobileCoverMoreMenu({ onShare, onArchive, onDelete }) {
  const options = [
    ...(onShare ? [{ value: "share", label: "Share", icon: "share" }] : []),
    { value: "archive", label: "Archive project", icon: "Archive" },
    { value: "delete", label: "Delete project", icon: "Trash", danger: true },
  ];
  return (
    <Dropdown
      className="mod-view-dd"
      buttonClassName="mod-act"
      ariaLabel="Project options"
      title="Project options"
      align="right"
      caret={false}
      options={options}
      onChange={(v) => {
        if (v === "share") onShare?.();
        else if (v === "archive") onArchive?.();
        else if (v === "delete") onDelete?.();
      }}
      renderOption={(o) => (
        <span className={"mobile-cover-more-opt" + (o.danger ? " danger" : "")}>
          <Icon name={o.icon} size={14} />
          {o.label}
        </span>
      )}
    >
      <Icon name="ellipsis" size={18} />
    </Dropdown>
  );
}

/** Tabs that can be opened from the mobile nav sheet. */
export function isMobileOpenableMod(mod) {
  const type = mod?.[0];
  return type === "Cover" || type === "Database" || type === "Notes";
}

export default function MobileGlobalBar({
  name,
  title,
  titleRainbow = false,
  folders = [],
  activeGlobal = null,
  activeProjectId = null,
  activeModId = null,
  onSelectGlobal,
  onSelectCover,
  onSelectMod,
  onOpenSettings,
  children,
}) {
  const [open, setOpen] = useState(false);
  const active = folders.filter((pr) => !isProjectArchived(pr));
  const label = title || globalLabel(name);
  const currentGlobal = activeGlobal || (activeProjectId ? null : name);

  const close = () => setOpen(false);

  const openSettings = () => {
    close();
    onOpenSettings?.();
  };

  const selectGlobal = (n) => {
    if (!onSelectGlobal) return;
    close();
    onSelectGlobal(n);
  };

  const selectCover = (projectIndex) => {
    if (!onSelectCover) return;
    close();
    onSelectCover(projectIndex);
  };

  const selectMod = (projectIndex, modIndex) => {
    if (!onSelectMod) return;
    close();
    onSelectMod(projectIndex, modIndex);
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
          <b>{label}</b>
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
          if (e.target === e.currentTarget) close();
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
                  const on = currentGlobal === n;
                  const rainbow = n === "Masterboard" && on;
                  const canSelect = n === "Masterboard" && !!onSelectGlobal;
                  const Row = canSelect ? "button" : "div";
                  return (
                    <Row
                      key={n}
                      type={canSelect ? "button" : undefined}
                      className={
                        "mobile-nav-row" +
                        (on ? " on" : "") +
                        (canSelect ? " mobile-nav-row-btn" : "")
                      }
                      aria-disabled={canSelect ? undefined : "true"}
                      onClick={canSelect ? () => selectGlobal(n) : undefined}
                    >
                      <span
                        style={rainbow ? undefined : { color: "var(--mute)" }}
                      >
                        <Icon name={n} rainbow={rainbow} />
                      </span>
                      <span>{globalLabel(n)}</span>
                    </Row>
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
                    const projectOn = pr.id === activeProjectId;
                    // Original folders index (active is filtered).
                    const projectIndex = folders.indexOf(pr);
                    return (
                      <div key={pr.id || i} className="mobile-nav-project">
                        <button
                          type="button"
                          className={
                            "mobile-nav-row mobile-nav-project-head mobile-nav-row-btn" +
                            (projectOn && !activeModId ? " on" : "")
                          }
                          disabled={!onSelectCover || projectIndex < 0}
                          onClick={() => selectCover(projectIndex)}
                        >
                          <span style={{ color }}>
                            <Icon name="folder" filled />
                          </span>
                          <span>{pr.name}</span>
                        </button>
                        {mods.map((mod, mi) => {
                          const type = mod?.[0];
                          const label = mod?.[1] || type || "Tab";
                          const modId = mod?.[2]?.id;
                          const on =
                            projectOn &&
                            (activeModId
                              ? modId === activeModId
                              : type === "Cover");
                          const canOpenCover =
                            type === "Cover" &&
                            !!onSelectCover &&
                            projectIndex >= 0;
                          const canOpenMod =
                            isMobileOpenableMod(mod) &&
                            type !== "Cover" &&
                            !!onSelectMod &&
                            projectIndex >= 0;
                          const canOpen = canOpenCover || canOpenMod;
                          const Row = canOpen ? "button" : "div";
                          return (
                            <Row
                              key={modId || `${pr.id}-${mi}`}
                              type={canOpen ? "button" : undefined}
                              className={
                                "mobile-nav-row mobile-nav-mod" +
                                (on ? " on" : "") +
                                (canOpen ? " mobile-nav-row-btn" : "")
                              }
                              aria-disabled={canOpen ? undefined : "true"}
                              onClick={
                                canOpenCover
                                  ? () => selectCover(projectIndex)
                                  : canOpenMod
                                    ? () => selectMod(projectIndex, mi)
                                    : undefined
                              }
                            >
                              {type && IC[type] ? (
                                <span style={{ color }}>
                                  <Icon name={type} />
                                </span>
                              ) : (
                                <span />
                              )}
                              <span>{label}</span>
                            </Row>
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
