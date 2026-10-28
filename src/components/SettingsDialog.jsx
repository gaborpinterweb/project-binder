import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons.jsx";
import { exportWorkspace, fetchArchivedProjects, importBackup } from "../api.js";
import {
  getPb,
  isCommercialMode,
  isPbMode,
  isProUser,
  polarPortalUrl,
} from "../pb/client.js";
import {
  APP_NAME,
  APP_COMMIT,
  APP_RELEASE_NAME,
  APP_VERSION,
  COUNTDOWN_DURATION_OPTIONS,
  STOPTIMER_MAX_OPTIONS_MIN,
  PC,
} from "../utils.js";
import { askConfirm } from "../confirmDialog.js";
import { askPrompt } from "../promptDialog.js";
import { askPaywall } from "../paywallDialog.js";
import { showSnackbar } from "../snackbar.js";
import Dropdown from "./Dropdown.jsx";
import DeleteAccountDialog from "./DeleteAccountDialog.jsx";

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
      list.push({ id: "billing", label: "Billing", icon: "Billing" });
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
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [billingPro, setBillingPro] = useState(() => isProUser());
  const [billingRefreshBusy, setBillingRefreshBusy] = useState(false);
  const [billingLastRefreshedAt, setBillingLastRefreshedAt] = useState(null);
  const [paywallCovering, setPaywallCovering] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const pwCurrentRef = useRef(null);

  const openPaywallFromSettings = async () => {
    setPaywallCovering(true);
    try {
      await askPaywall({ underExistingOverlay: true });
    } finally {
      setPaywallCovering(false);
    }
  };

  useEffect(() => {
    if (tab !== "billing" || !isCommercialMode()) return;
    let cancelled = false;
    (async () => {
      try {
        await getPb().collection("users").authRefresh();
        if (!cancelled) {
          setBillingPro(isProUser());
          setBillingLastRefreshedAt(new Date());
        }
      } catch {
        if (!cancelled) setBillingPro(isProUser());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const refreshBillingStatus = async () => {
    if (billingRefreshBusy) return;
    setBillingRefreshBusy(true);
    try {
      await getPb().collection("users").authRefresh();
      setBillingPro(isProUser());
      setBillingLastRefreshedAt(new Date());
    } catch {
      showSnackbar("Could not refresh billing status");
    } finally {
      setBillingRefreshBusy(false);
    }
  };

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
    if (!isCommercialMode() && tab === "billing") setTab("experience");
  }, [tab]);

  const openProUrl = (url, missingLabel) => {
    if (url) {
      window.open(url, "_blank", "noopener");
      return;
    }
    alert(`${missingLabel} URL is not configured for this build.`);
  };

  useEffect(() => {
    if (!pwOpen) return;
    const t = requestAnimationFrame(() => pwCurrentRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [pwOpen]);

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

  const handleChangeEmail = async () => {
    const current = String(getPb().authStore.record?.email || "").trim();
    const entered = await askPrompt({
      title: "Change email",
      message: "Enter the new email address. We will send a confirmation link there.",
      defaultValue: "",
      placeholder: "you@example.com",
      confirmLabel: "Send link",
    });
    if (entered == null) return;
    const newEmail = String(entered).trim();
    if (!newEmail) {
      showSnackbar({
        icon: "bell",
        tone: "error",
        center: true,
        message: "Enter a new email address.",
        durationMs: 4000,
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      showSnackbar({
        icon: "bell",
        tone: "error",
        center: true,
        message: "That does not look like a valid email.",
        durationMs: 4000,
      });
      return;
    }
    if (current && newEmail.toLowerCase() === current.toLowerCase()) {
      showSnackbar({
        icon: "bell",
        tone: "error",
        center: true,
        message: "That is already your current email.",
        durationMs: 4000,
      });
      return;
    }
    try {
      await getPb().collection("users").requestEmailChange(newEmail);
      showSnackbar({
        icon: "check",
        tone: "success",
        center: true,
        message: "Confirmation email sent. Check the new inbox.",
        durationMs: 6000,
      });
    } catch (err) {
      showSnackbar({
        icon: "bell",
        tone: "error",
        center: true,
        message: err?.message || "Could not request email change",
        durationMs: 6000,
      });
    }
  };

  const closePasswordDialog = () => {
    if (pwBusy) return;
    setPwOpen(false);
    setPwCurrent("");
    setPwNext("");
    setPwConfirm("");
    setPwError("");
  };

  useEffect(() => {
    const esc = (e) => {
      if (e.key !== "Escape") return;
      if (pwOpen) {
        e.preventDefault();
        if (pwBusy) return;
        setPwOpen(false);
        setPwCurrent("");
        setPwNext("");
        setPwConfirm("");
        setPwError("");
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, pwOpen, pwBusy]);

  const openPasswordDialog = () => {
    setPwCurrent("");
    setPwNext("");
    setPwConfirm("");
    setPwError("");
    setPwBusy(false);
    setPwOpen(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    const oldPassword = pwCurrent;
    const password = pwNext;
    const passwordConfirm = pwConfirm;
    if (!oldPassword || !password || !passwordConfirm) {
      setPwError("Fill in all password fields.");
      return;
    }
    if (password.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (password !== passwordConfirm) {
      setPwError("New passwords do not match.");
      return;
    }
    const pb = getPb();
    const userId = pb.authStore.record?.id;
    const email = String(pb.authStore.record?.email || "").trim();
    if (!userId || !email) {
      setPwError("Not signed in.");
      return;
    }
    setPwBusy(true);
    try {
      await pb.collection("users").update(userId, {
        oldPassword,
        password,
        passwordConfirm,
      });
      await pb.collection("users").authWithPassword(email, password);
      setPwBusy(false);
      setPwOpen(false);
      setPwCurrent("");
      setPwNext("");
      setPwConfirm("");
      setPwError("");
      showSnackbar({
        icon: "check",
        tone: "success",
        center: true,
        message: "Password updated.",
        durationMs: 4000,
      });
    } catch (err) {
      setPwBusy(false);
      setPwError(err?.message || "Could not update password");
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
    <>
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget || pwOpen || paywallCovering) return;
        onClose();
      }}
    >
      <div
        className="dlg settings-dlg"
        role="dialog"
        aria-label="Settings"
        hidden={paywallCovering}
        aria-hidden={paywallCovering || undefined}
      >
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
                  <button
                    type="button"
                    className="settings-row-btn"
                    onClick={() => void handleChangeEmail()}
                  >
                    Change Email
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Change password</b>
                    <span>Set a new password for this account</span>
                  </div>
                  <button
                    type="button"
                    className="settings-row-btn"
                    onClick={openPasswordDialog}
                  >
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
                    onClick={() => setDeleteAccountOpen(true)}
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === "billing" && isCommercialMode() && (
            <section className="settings-section">
              <div className="settings-rows">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <b>Plan</b>
                    <span>{billingPro ? "Cloud Pro" : "Cloud Free"}</span>
                  </div>
                  {billingPro ? (
                    <button
                      type="button"
                      className="settings-row-btn"
                      disabled={!polarPortalUrl()}
                      onClick={() => openProUrl(polarPortalUrl(), "Portal")}
                    >
                      Manage
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="settings-row-btn settings-row-btn-pro"
                      onClick={() => void openPaywallFromSettings()}
                    >
                      Get Cloud Pro
                    </button>
                  )}
                </div>
              </div>
              <p className="settings-billing-meta">
                Last refreshed{" "}
                {billingLastRefreshedAt
                  ? billingLastRefreshedAt.toLocaleString()
                  : "—"}
                {" · "}
                <button
                  type="button"
                  className="settings-billing-refresh"
                  disabled={billingRefreshBusy}
                  onClick={() => void refreshBillingStatus()}
                >
                  {billingRefreshBusy ? "Refreshing…" : "Refresh"}
                </button>
              </p>
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
                      {APP_RELEASE_NAME ? ` · ${APP_RELEASE_NAME}` : ""}
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
    <DeleteAccountDialog
      open={deleteAccountOpen}
      onClose={() => setDeleteAccountOpen(false)}
    />
    {pwOpen ? (
      <div
        className="ov ov-prompt"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !pwBusy) closePasswordDialog();
        }}
      >
        <div
          className="dlg prompt-dlg"
          role="dialog"
          aria-modal="true"
          aria-label="Change password"
        >
          <div className="dlg-content prompt-body">
            <h2 className="prompt-title">Change password</h2>
            <p className="prompt-msg">
              Enter your current password, then choose a new one.
            </p>
            <form className="prompt-form" onSubmit={handleChangePassword}>
              <label className="prompt-field">
                Current password
                <input
                  ref={pwCurrentRef}
                  className="prompt-input"
                  type="password"
                  autoComplete="current-password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  disabled={pwBusy}
                  required
                />
              </label>
              <label className="prompt-field">
                New password
                <input
                  className="prompt-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={pwNext}
                  onChange={(e) => setPwNext(e.target.value)}
                  disabled={pwBusy}
                  required
                />
              </label>
              <label className="prompt-field">
                Confirm new password
                <input
                  className="prompt-input"
                  type="password"
                  autoComplete="new-password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  disabled={pwBusy}
                  required
                />
              </label>
              {pwError ? <p className="auth-error">{pwError}</p> : null}
              <div className="actions prompt-actions">
                <button
                  type="button"
                  className="dlg-delete"
                  onClick={closePasswordDialog}
                  disabled={pwBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="dlg-create" disabled={pwBusy}>
                  {pwBusy ? "…" : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
