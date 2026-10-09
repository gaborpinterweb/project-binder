import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons.jsx";
import {
  exportWorkspace,
  revealUserData,
  fetchAppInfo,
  saveBackupSettings,
  runBackupNow,
  pickBackupFolder,
  importBackup,
} from "../api.js";
import { APP_NAME, APP_VERSION, PC } from "../utils.js";
import { askConfirm } from "../confirmDialog.js";
import Dropdown from "./Dropdown.jsx";

const AUTO_BACKUP_FILENAME_PATTERN = "project-binder-backup-YYYY-MM-DD.zip";
const AUTO_BACKUP_KEEP_DAYS = 3;

const BMC_URL = "https://buymeacoffee.com/gaborpinter";
const GITHUB_URL = "https://github.com/gaborpinterweb/project-binder";
const SITE_URL = "https://gaborpinter.com";

const OPEN_ON_LAUNCH_OPTIONS = [
  { value: "masterboard", label: "Master board" },
  { value: "last-tab", label: "Last tab" },
];

function formatBackupTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SettingsDialog({
  folders = [],
  openOnLaunch,
  onOpenOnLaunchChange,
  uiSounds,
  onUiSoundsChange,
  onReactivate,
  onClose,
  onResetSeed,
  onResetEmpty,
  onResetFirstLaunch,
  onImportBackup,
}) {
  const tabs = useMemo(() => {
    const list = [
      { id: "appearance", label: "Appearance", icon: "Appearance" },
      { id: "archive", label: "Archive", icon: "Archive" },
      { id: "data", label: "Data", icon: "Workspace" },
      { id: "about", label: "About", icon: "About" },
    ];
    if (import.meta.env.DEV) {
      list.push({ id: "developer", label: "Developer", icon: "Developer" });
    }
    return list;
  }, []);

  const archivedProjects = useMemo(
    () => folders.filter((pr) => pr.archived),
    [folders]
  );

  const [tab, setTab] = useState("appearance");
  const [resetting, setResetting] = useState(null);
  const [desktop, setDesktop] = useState(false);
  const [backup, setBackup] = useState({
    enabled: false,
    folderPath: "",
    lastBackupAt: null,
    lastError: null,
    filename: AUTO_BACKUP_FILENAME_PATTERN,
    keepDays: AUTO_BACKUP_KEEP_DAYS,
  });
  const [backupBusy, setBackupBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchAppInfo();
        if (cancelled) return;
        setDesktop(!!info.desktop);
        if (info.backup) {
          setBackup((prev) => ({
            ...prev,
            ...info.backup,
            filename: info.autoBackupFilename || prev.filename,
            keepDays:
              info.autoBackupKeepDays != null
                ? Number(info.autoBackupKeepDays) || prev.keepDays
                : prev.keepDays,
          }));
        }
      } catch {
        if (!cancelled) setDesktop(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const applyBackupState = (data) => {
    if (!data || typeof data !== "object") return;
    setBackup((prev) => ({
      ...prev,
      enabled: !!data.enabled,
      folderPath: data.folderPath != null ? String(data.folderPath) : prev.folderPath,
      lastBackupAt: data.lastBackupAt !== undefined ? data.lastBackupAt : prev.lastBackupAt,
      lastError: data.lastError !== undefined ? data.lastError : prev.lastError,
      filename: data.filename || prev.filename,
      keepDays:
        data.keepDays != null ? Number(data.keepDays) || prev.keepDays : prev.keepDays,
    }));
  };

  const persistBackup = async (patch) => {
    setBackupBusy("save");
    try {
      const data = await saveBackupSettings(patch);
      applyBackupState(data);
    } catch (e) {
      alert(e.message || "Could not save backup settings.");
    } finally {
      setBackupBusy(null);
    }
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

  const handleBrowseFolder = async () => {
    setBackupBusy("folder");
    try {
      const picked = await pickBackupFolder();
      if (picked.cancelled || !picked.path) return;
      const data = await saveBackupSettings({ enabled: true, folderPath: picked.path });
      applyBackupState(data);
    } catch (e) {
      alert(e.message || "Could not choose folder.");
    } finally {
      setBackupBusy(null);
    }
  };

  const handleToggleAutoBackup = async (checked) => {
    if (checked && !backup.folderPath) {
      await handleBrowseFolder();
      return;
    }
    await persistBackup({ enabled: checked, folderPath: backup.folderPath });
  };

  const handleBackupNow = async () => {
    setBackupBusy("now");
    try {
      const data = await runBackupNow();
      applyBackupState(data);
    } catch (e) {
      alert(e.message || "Backup failed.");
    } finally {
      setBackupBusy(null);
    }
  };

  const runImportZip = async () => {
    setBackupBusy("import");
    try {
      const data = await importBackup();
      if (data?.cancelled) return;
      await onImportBackup?.(data);
      onClose();
    } catch (e) {
      alert(e.message || "Could not import workspace.");
    } finally {
      setBackupBusy(null);
    }
  };

  const handleImport = async () => {
    const choice = await askConfirm({
      title: "Import workspace?",
      message:
        "Importing a zip replaces your current workspace and uploaded files. Export your current data first if you might need it.",
      confirmLabel: "Import new without exporting current",
      altLabel: "Export current",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!choice) return;
    if (choice === "alt") {
      try {
        await exportWorkspace();
      } catch {
        alert("Could not export workspace.");
        return;
      }
      await runImportZip();
      return;
    }
    await runImportZip();
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

  const lastBackupLabel = formatBackupTime(backup.lastBackupAt);
  const backupDisabled = !!backupBusy;

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
                <h3 className="settings-heading">Sound</h3>
                <ul className="settings-checks">
                  <li>
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={!!uiSounds}
                        onChange={(e) => onUiSoundsChange?.(e.target.checked)}
                      />
                      <span>UI sounds</span>
                    </label>
                  </li>
                </ul>
              </section>
            </>
          )}

          {tab === "archive" && (
            <section className="settings-section">
              {archivedProjects.length === 0 ? (
                <p className="settings-empty">No archived projects.</p>
              ) : (
                <div className="settings-rows">
                  {archivedProjects.map((pr, i) => (
                    <div key={pr.slug} className="settings-row">
                      <div className="settings-row-copy settings-archive-item">
                        <span
                          className="settings-archive-icon"
                          style={{ color: pr.color || PC[i % PC.length] }}
                          aria-hidden="true"
                        >
                          <Icon name="folder" size={18} />
                        </span>
                        <b>{pr.name}</b>
                      </div>
                      <button
                        type="button"
                        className="settings-row-btn"
                        onClick={() => onReactivate?.(pr)}
                      >
                        Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "data" && (
            <>
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

              {desktop && (
                <section className="settings-section">
                  <h3 className="settings-heading">Auto backup</h3>
                  <ul className="settings-checks">
                    <li>
                      <label className="settings-check">
                        <input
                          type="checkbox"
                          checked={!!backup.enabled}
                          disabled={backupDisabled}
                          onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                        />
                        <span>Back up automatically every 5 minutes and on launch</span>
                      </label>
                    </li>
                  </ul>
                  <div className="settings-rows">
                    <div className="settings-row settings-row-stack">
                      <div className="settings-row-copy">
                        <b>Backup folder</b>
                        <span>
                          Day copies: {backup.filename || AUTO_BACKUP_FILENAME_PATTERN}{" "}
                          (keeps {backup.keepDays || AUTO_BACKUP_KEEP_DAYS} days · workspace +
                          files)
                        </span>
                        {backup.folderPath ? (
                          <span className="settings-path" title={backup.folderPath}>
                            {backup.folderPath}
                          </span>
                        ) : (
                          <span>No folder selected</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="settings-row-btn"
                        disabled={backupDisabled}
                        onClick={handleBrowseFolder}
                      >
                        {backupBusy === "folder" ? "…" : "Browse"}
                      </button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-copy">
                        <b>Last backup</b>
                        <span>
                          {lastBackupLabel || "Not yet backed up"}
                          {backup.lastError ? ` · Error: ${backup.lastError}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="settings-row-btn"
                        disabled={
                          backupDisabled || !backup.enabled || !backup.folderPath
                        }
                        onClick={handleBackupNow}
                      >
                        {backupBusy === "now" ? "…" : "Backup now"}
                      </button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-copy">
                        <b>Import workspace</b>
                        <span>Replace this workspace from a backup .zip</span>
                      </div>
                      <button
                        type="button"
                        className="settings-row-btn settings-row-btn-danger"
                        disabled={backupDisabled}
                        onClick={handleImport}
                      >
                        {backupBusy === "import" ? "…" : "Import"}
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </>
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
