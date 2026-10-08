import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons.jsx";
import { exportWorkspace, revealUserData } from "../api.js";
import {
  APP_NAME,
  APP_VERSION,
  SIDEBAR_VIS_ITEMS,
  globalLabel,
} from "../utils.js";
import { askConfirm } from "../confirmDialog.js";
import Dropdown from "./Dropdown.jsx";

const BMC_URL = "https://buymeacoffee.com/gaborpinter";
const GITHUB_URL = "https://github.com/gaborpinterweb/project-binder";
const SITE_URL = "https://gaborpinter.com";

const OPEN_ON_LAUNCH_OPTIONS = [
  { value: "masterboard", label: "Master board" },
  { value: "last-tab", label: "Last tab" },
];

export default function SettingsDialog({
  visibility,
  onChange,
  openOnLaunch,
  onOpenOnLaunchChange,
  onClose,
  onResetSeed,
  onResetEmpty,
  onResetFirstLaunch,
}) {
  const tabs = useMemo(() => {
    const list = [
      { id: "appearance", label: "Appearance", icon: "Appearance" },
      { id: "data", label: "Data", icon: "Workspace" },
      { id: "about", label: "About", icon: "About" },
    ];
    if (import.meta.env.DEV) {
      list.push({ id: "developer", label: "Developer", icon: "Developer" });
    }
    return list;
  }, []);

  const [tab, setTab] = useState("appearance");
  const [resetting, setResetting] = useState(null);

  useEffect(() => {
    if (!import.meta.env.DEV && tab === "developer") setTab("appearance");
  }, [tab]);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const setVisible = (id, checked) => {
    onChange?.({ ...visibility, [id]: checked });
  };

  const handleExport = async () => {
    try {
      await exportWorkspace();
    } catch {
      alert("Could not export workspace.");
    }
  };

  const handleShowUserData = async () => {
    try {
      await revealUserData();
    } catch {
      alert("Could not open the user data folder.");
    }
  };

  const runReset = async (kind, title, message, action) => {
    const ok = await askConfirm({
      title,
      message,
      confirmLabel: "Reset",
      danger: true,
    });
    if (!ok) return;
    setResetting(kind);
    try {
      await action?.();
      onClose();
    } catch {
      alert("Could not reset workspace.");
    } finally {
      setResetting(null);
    }
  };

  const handleResetSeed = () =>
    runReset(
      "seed",
      "Reset to seed workspace?",
      "This replaces all current data with seedWorkspace.json. Your changes will be lost.",
      onResetSeed
    );

  const handleResetEmpty = () =>
    runReset(
      "empty",
      "Reset to empty workspace?",
      "This deletes all projects, tasks, and timelogs. Your changes will be lost.",
      onResetEmpty
    );

  const handleResetFirstLaunch = () =>
    runReset(
      "first-launch",
      "Reset to first launch?",
      "This restores seed data, clears saved views and settings, and reloads the app. Your changes will be lost.",
      onResetFirstLaunch
    );

  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dlg settings-dlg" role="dialog" aria-label="Settings">
        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={"settings-tab" + (tab === t.id ? " on" : "")}
              onClick={() => setTab(t.id)}
            >
              <span className="settings-tab-icon" aria-hidden="true">
                <Icon name={t.icon} size={22} />
              </span>
              <span className="settings-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="dlg-content settings-panel" role="tabpanel">
          {tab === "appearance" && (
            <>
              <section className="settings-section">
                <div className="settings-rows">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <b>Open on launch</b>
                    </div>
                    <Dropdown
                      className="settings-launch-dd"
                      align="right"
                      ariaLabel="Open on launch"
                      value={openOnLaunch}
                      options={OPEN_ON_LAUNCH_OPTIONS}
                      onChange={onOpenOnLaunchChange}
                    />
                  </div>
                </div>
              </section>
              <section className="settings-section">
                <h3 className="settings-heading">Sidebar</h3>
                <ul className="settings-checks">
                  {SIDEBAR_VIS_ITEMS.map((id) => (
                    <li key={id}>
                      <label className="settings-check">
                        <input
                          type="checkbox"
                          checked={!!visibility[id]}
                          onChange={(e) => setVisible(id, e.target.checked)}
                        />
                        <span>{globalLabel(id)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {tab === "data" && (
            <section className="settings-section">
              <h3 className="settings-heading">Backup</h3>
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Show user data</b>
                    <span>Open the folder where your workspace is stored</span>
                  </div>
                  <button type="button" className="settings-row-btn" onClick={handleShowUserData}>
                    Show
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Export data</b>
                    <span>Download your userWorkspace.json backup</span>
                  </div>
                  <button type="button" className="settings-row-btn" onClick={handleExport}>
                    Export
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === "about" && (
            <section className="settings-about">
              <div className="settings-about-brand">
                <img
                  className="settings-about-icon"
                  src="/app-icon.png"
                  alt=""
                  width={72}
                  height={72}
                  draggable={false}
                />
                <b>{APP_NAME}</b>
                <span>v{APP_VERSION}</span>
              </div>
              <div className="settings-about-links">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
                <p>
                  Created by Gábor Pintér ·{" "}
                  <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
                    gaborpinter.com
                  </a>
                </p>
              </div>
            </section>
          )}

          {import.meta.env.DEV && tab === "developer" && (
            <section className="settings-section">
              <h3 className="settings-heading">Import</h3>
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Import data</b>
                    <span>Restore from a userWorkspace.json file (not implemented)</span>
                  </div>
                  <button type="button" className="settings-row-btn" disabled>
                    Import
                  </button>
                </div>
              </div>
              <h3 className="settings-heading">Workspace resets</h3>
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Reset to seed workspace</b>
                    <span>Replace all data with seedWorkspace.json</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn settings-row-btn-danger"
                    disabled={!!resetting}
                    onClick={handleResetSeed}
                  >
                    {resetting === "seed" ? "Resetting…" : "Reset"}
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Reset to empty workspace</b>
                    <span>Clear all projects, tasks, and timelogs</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn settings-row-btn-danger"
                    disabled={!!resetting}
                    onClick={handleResetEmpty}
                  >
                    {resetting === "empty" ? "Resetting…" : "Reset"}
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Reset to first launch</b>
                    <span>Restore seed data, clear UI state, and reload</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn settings-row-btn-danger"
                    disabled={!!resetting}
                    onClick={handleResetFirstLaunch}
                  >
                    {resetting === "first-launch" ? "Resetting…" : "Reset"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        <a
          className="settings-announce"
          href={BMC_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="settings-announce-heart" aria-hidden="true">
            ♥
          </span>
          Enjoying {APP_NAME}? Buy me a coffee →
        </a>
      </div>
    </div>
  );
}
