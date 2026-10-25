import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons.jsx";
import { exportWorkspace, fetchArchivedProjects, importBackup } from "../api.js";
import {
  getPb,
  isCommercialMode,
  isPbMode,
  lsCheckoutUrl,
  lsPortalUrl,
} from "../pb/client.js";
import {
  APP_NAME,
  APP_COMMIT,
  APP_VERSION,
  COUNTDOWN_DURATION_OPTIONS,
  STOPTIMER_MAX_OPTIONS_MIN,
  PC,
} from "../utils.js";
import { askConfirm } from "../confirmDialog.js";
import { showSnackbar } from "../snackbar.js";
import Dropdown from "./Dropdown.jsx";

const GITHUB_URL = "https://github.com/gaborpinterweb/project-binder";
const SITE_URL =
  "https://gaborpinter.com/?utm_source=project-binder&utm_medium=app&utm_campaign=settings-about";
const LEARN_URL = "https://projectbinder.app/learn";
const FEEDBACK_URL = "https://projectbinder.app/feedback";

const COUNTDOWN_DURATION_DD_OPTIONS = COUNTDOWN_DURATION_OPTIONS.map((min) => ({
  value: String(min),
  label: `${min} min`,
}));

const STOPTIMER_MAX_DD_OPTIONS = STOPTIMER_MAX_OPTIONS_MIN.map((min) => ({
  value: String(min),
  label: min === 0 ? "No limit" : `${min / 60}h`,
}));

export default function SettingsDialog({
  countdownDurationMin,
  onCountdownDurationChange,
  stoptimerMaxMin,
  onStoptimerMaxChange,
  uiSounds,
  onUiSoundsChange,
  onReactivate,
  onClose,
  onResetSeed,
  onResetEmpty,
  onResetFirstLaunch,
}) {
  const tabs = useMemo(() => {
    const list = [
      { id: "experience", label: "Experience", icon: "Experience" },
    ];
    if (isPbMode()) {
      list.push({ id: "account", label: "Account", icon: "Account" });
    }
    if (isCommercialMode()) {
      list.push({ id: "pro", label: "Pro", icon: "Pro" });
    }
    list.push(
      { id: "data", label: "Data", icon: "Workspace" },
      { id: "archive", label: "Archive", icon: "Archive" },
      { id: "help", label: "Help", icon: "Help" },
      { id: "about", label: "About", icon: "About" }
    );
    if (import.meta.env.DEV) {
      list.push({ id: "developer", label: "Developer", icon: "Developer" });
    }
    return list;
  }, []);

  const [tab, setTab] = useState("experience");
  const [archivedProjects, setArchivedProjects] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [resetting, setResetting] = useState(null);

  useEffect(() => {
    if (tab !== "archive") return;
    let cancelled = false;
    setArchiveLoading(true);
    (async () => {
      try {
        const list = await fetchArchivedProjects();
        if (!cancelled) setArchivedProjects(list);
      } catch {
        if (!cancelled) setArchivedProjects([]);
      } finally {
        if (!cancelled) setArchiveLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (!import.meta.env.DEV && tab === "developer") setTab("experience");
    if (!isPbMode() && tab === "account") setTab("experience");
    if (!isCommercialMode() && tab === "pro") setTab("experience");
  }, [tab]);

  const openProUrl = (url, missingLabel) => {
    if (url) {
      window.open(url, "_blank", "noopener");
      return;
    }
    alert(`${missingLabel} URL is not configured for this build.`);
  };

  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const handleExport = async () => {
    try {
      await exportWorkspace();
    } catch {
      alert("Could not export workspace.");
    }
  };

  const handleImportZip = async (file) => {
    if (!file) return;
    const ok = await askConfirm({
      title: "Import workspace data?",
      message:
        "This replaces your current workspace from the backup zip. Export first if you might need it.",
      confirmLabel: "Import",
      danger: true,
    });
    if (!ok) return;
    try {
      await importBackup({ file });
      window.location.reload();
    } catch (e) {
      alert(e.message || "Could not import workspace.");
    }
  };

  const handleSignOut = async () => {
    const ok = await askConfirm({
      title: "Sign out?",
      message: "You will need to sign in again to open this workspace.",
      confirmLabel: "Sign out",
    });
    if (!ok) return;
    getPb().authStore.clear();
    window.location.reload();
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
          {tab === "experience" && (
            <section className="settings-section">
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Countdown duration</b>
                    <span>Default length for focus sessions</span>
                  </div>
                  <Dropdown
                    className="settings-pref-dd"
                    align="right"
                    ariaLabel="Countdown duration"
                    value={String(countdownDurationMin)}
                    options={COUNTDOWN_DURATION_DD_OPTIONS}
                    onChange={(value) => onCountdownDurationChange?.(Number(value))}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Stopwatch maximum</b>
                    <span>Cap how long an open run can last</span>
                  </div>
                  <Dropdown
                    className="settings-pref-dd"
                    align="right"
                    ariaLabel="Stopwatch maximum"
                    value={String(stoptimerMaxMin)}
                    options={STOPTIMER_MAX_DD_OPTIONS}
                    onChange={(value) => onStoptimerMaxChange?.(Number(value))}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>UI sounds</b>
                    <span>Play clicks and completion chimes</span>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={!!uiSounds}
                      onChange={(e) => onUiSoundsChange?.(e.target.checked)}
                      aria-label="UI sounds"
                    />
                    <span className="settings-toggle-ui" aria-hidden="true" />
                  </label>
                </div>
              </div>
            </section>
          )}

          {tab === "archive" && (
            <section className="settings-section">
              {archiveLoading ? (
                <p className="settings-empty">Loading…</p>
              ) : archivedProjects.length === 0 ? (
                <p className="settings-empty">No archived projects.</p>
              ) : (
                <div className="settings-rows">
                  {archivedProjects.map((pr, i) => (
                    <div key={pr.id} className="settings-row">
                      <div className="settings-row-copy settings-archive-item">
                        <span
                          className="settings-archive-icon"
                          style={{ color: pr.color || PC[i % PC.length] }}
                          aria-hidden="true"
                        >
                          <Icon name="folder" size={18} filled />
                        </span>
                        <b>{pr.name}</b>
                      </div>
                      <button
                        type="button"
                        className="settings-row-btn"
                        onClick={async () => {
                          await onReactivate?.(pr);
                          try {
                            setArchivedProjects(await fetchArchivedProjects());
                          } catch {
                            setArchivedProjects([]);
                          }
                        }}
                      >
                        Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "account" && isPbMode() && (
            <section className="settings-section">
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Change Email</b>
                    <span>Update the email on this account</span>
                  </div>
                  <button type="button" className="settings-row-btn" disabled>
                    Change Email
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Change password</b>
                    <span>Set a new password for this account</span>
                  </div>
                  <button type="button" className="settings-row-btn" disabled>
                    Change password
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Sign out</b>
                    <span>
                      {getPb().authStore.record?.email || "End this session"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn"
                    onClick={() => void handleSignOut()}
                  >
                    Sign out
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Delete account</b>
                    <span>Permanently remove this account and its data</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn settings-row-btn-danger"
                    disabled
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === "pro" && isCommercialMode() && (
            <section className="settings-section">
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Hosted commercial instance</b>
                    <span>
                      Pro for this hosted Project Binder is billed via Lemon
                      Squeezy.
                    </span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Subscribe / upgrade</b>
                    <span>Open checkout to start or change a subscription</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn"
                    disabled={!lsCheckoutUrl()}
                    onClick={() => openProUrl(lsCheckoutUrl(), "Checkout")}
                  >
                    Subscribe
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Manage subscription</b>
                    <span>Update payment method or cancel in the customer portal</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn"
                    disabled={!lsPortalUrl()}
                    onClick={() => openProUrl(lsPortalUrl(), "Portal")}
                  >
                    Manage
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === "data" && (
            <section className="settings-section">
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Export workspace data</b>
                    <span>Download a .zip of your workspace and files</span>
                  </div>
                  <button type="button" className="settings-row-btn" onClick={handleExport}>
                    Export
                  </button>
                </div>
                {isPbMode() && (
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <b>Import workspace data</b>
                      <span>Replace this workspace from a backup .zip</span>
                    </div>
                    <label className="settings-row-btn">
                      Import
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          void handleImportZip(f);
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "help" && (
            <section className="settings-section">
              <div className="settings-rows">
                <div className="settings-row">
                  <span className="settings-row-icon" aria-hidden="true">
                    <Icon name="Play" size={20} />
                  </span>
                  <div className="settings-row-copy">
                    <b>Learning videos</b>
                    <span>Tutorials, tips and guides to become a pro binder</span>
                  </div>
                  <a
                    className="settings-row-btn"
                    href={LEARN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open videos
                    <Icon name="external" size={14} />
                  </a>
                </div>
                <div className="settings-row">
                  <span className="settings-row-icon" aria-hidden="true">
                    <Icon name="Chat" size={20} />
                  </span>
                  <div className="settings-row-copy">
                    <b>Feedback form</b>
                    <span>Submit a feature request, bug report or ask a question</span>
                  </div>
                  <a
                    className="settings-row-btn"
                    href={FEEDBACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open form
                    <Icon name="external" size={14} />
                  </a>
                </div>
                <div className="settings-row">
                  <span className="settings-row-icon" aria-hidden="true">
                    <Icon name="GitHub" size={20} />
                  </span>
                  <div className="settings-row-copy">
                    <b>GitHub</b>
                    <span>Browse the source, star the project, or follow updates</span>
                  </div>
                  <a
                    className="settings-row-btn"
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open repo
                    <Icon name="external" size={14} />
                  </a>
                </div>
              </div>
            </section>
          )}

          {tab === "about" && (
            <section className="settings-about">
              <div className="settings-about-main">
                <div className="settings-about-brand">
                  <img
                    className="settings-about-icon"
                    src="/app-icon.png"
                    alt=""
                    width={72}
                    height={72}
                    draggable={false}
                  />
                  <div className="settings-about-copy">
                    <b>{APP_NAME}</b>
                    <p className="settings-about-byline">
                      {isCommercialMode() ? "Commercial" : "Community"} build{" "}
                      {APP_VERSION}
                      {APP_COMMIT ? ` (${APP_COMMIT})` : ""}
                    </p>
                    <p className="settings-about-byline">
                      Created by{" "}
                      <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
                        Gábor Pintér
                      </a>
                    </p>
                  </div>
                </div>
                  <div className="settings-about-credits">
                  <b>Credits</b>
                  <p>
                    <a
                      href="https://icons8.com/icon/vj8GRDfKf8Ac/stopwatch"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Stopwatch
                    </a>{" "}
                    icon by{" "}
                    <a href="https://icons8.com" target="_blank" rel="noopener noreferrer">
                      Icons8
                    </a>
                  </p>
                </div>
              </div>
            </section>
          )}

          {import.meta.env.DEV && tab === "developer" && (
            <>
              <section className="settings-section">
                <h3 className="settings-heading">Feedback</h3>
                <div className="settings-rows">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <b>Preview snackbar</b>
                      <span>Bottom-center toast with an action button</span>
                    </div>
                    <button
                      type="button"
                      className="settings-row-btn"
                      onClick={() => {
                        showSnackbar({
                          icon: "stopwatch",
                          message:
                            "Timer stopped and saved — task completed · Deep work: Project Binder snackbar review · 25:00",
                          persist: true,
                          action: {
                            label: "Add note",
                            onClick: () => {
                              showSnackbar({
                                message: "CTA clicked",
                                durationMs: 2500,
                              });
                            },
                          },
                        });
                      }}
                    >
                      Show
                    </button>
                  </div>
                </div>
              </section>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
