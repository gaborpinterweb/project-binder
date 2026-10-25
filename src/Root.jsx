import { useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import AuthGate from "./components/AuthGate.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import Snackbar from "./components/Snackbar.jsx";
import { getPb, isPbMode, isCloudMode } from "./pb/client.js";
import { loadUserDocs, saveUserDocs } from "./pb/persist.js";
import { workspaceEngine } from "./engine/workspaceEngine.js";
import { ensurePersistHook } from "./engine/apiBridge.js";
import { showSnackbar } from "./snackbar.js";

function readAuthParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    verify: q.get("verify") || "",
    reset: q.get("reset") || "",
  };
}

function clearAuthParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("verify");
  url.searchParams.delete("reset");
  const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
  window.history.replaceState({}, "", next);
}

async function loadSeed() {
  const res = await fetch("/seedWorkspace.json");
  if (!res.ok) throw new Error("Could not load seedWorkspace.json");
  return res.json();
}

async function bootstrapPbSession() {
  ensurePersistHook();
  const seed = await loadSeed();
  const { workspace, archive } = await loadUserDocs();
  if (workspace && Number(workspace.version) >= 2) {
    workspaceEngine.loadFromWorkspaceDoc(workspace);
    workspaceEngine.loadFromArchiveDoc(archive || { version: 2, projects: [] });
  } else {
    workspaceEngine.resetToSeed(seed);
    workspaceEngine.loadFromArchiveDoc({ version: 2, projects: [] });
    const docs = workspaceEngine.exportWorkspaceData();
    await saveUserDocs(docs);
  }
}

function sessionIsVerified() {
  const pb = getPb();
  return pb.authStore.isValid && !!pb.authStore.record?.verified;
}

export default function Root() {
  const [ready, setReady] = useState(!isPbMode());
  const [authed, setAuthed] = useState(() => {
    if (!isPbMode()) return true;
    return sessionIsVerified();
  });
  const [bootError, setBootError] = useState("");
  const [booting, setBooting] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [authGateMode, setAuthGateMode] = useState("login");

  const finishAuth = useCallback(async () => {
    setBooting(true);
    setBootError("");
    try {
      if (!sessionIsVerified()) {
        getPb().authStore.clear();
        setAuthed(false);
        setReady(false);
        return;
      }
      await bootstrapPbSession();
      setAuthed(true);
      setReady(true);
    } catch (err) {
      setBootError(err?.message || String(err));
      setAuthed(false);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    if (!isPbMode()) return;
    if (sessionIsVerified()) {
      finishAuth();
    } else if (getPb().authStore.isValid) {
      getPb().authStore.clear();
    }
  }, [finishAuth]);

  useEffect(() => {
    if (!isPbMode()) return;
    let cancelled = false;
    (async () => {
      const { verify, reset } = readAuthParams();
      if (verify) {
        try {
          await getPb().collection("users").confirmVerification(verify);
          if (cancelled) return;
          clearAuthParams();
          showSnackbar({
            icon: "check",
            tone: "success",
            center: true,
            message: "Email verified. You can sign in.",
            durationMs: 5000,
          });
          setAuthGateMode("login");
        } catch (err) {
          if (cancelled) return;
          clearAuthParams();
          showSnackbar({
            icon: "bell",
            tone: "error",
            center: true,
            message: err?.message || "Could not verify email",
            durationMs: 6000,
          });
        }
      } else if (reset) {
        clearAuthParams();
        setResetToken(reset);
        setAuthGateMode("reset");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isPbMode()) return;
    const onClick = async (e) => {
      const a = e.target.closest?.("a[href^='pb-blob://']");
      if (!a) return;
      e.preventDefault();
      const { resolvePbBlobUrl } = await import("./api.js");
      const obj = await resolvePbBlobUrl(a.getAttribute("href"));
      if (obj && obj !== a.getAttribute("href")) {
        const w = window.open(obj, "_blank");
        if (!w) {
          const link = document.createElement("a");
          link.href = obj;
          link.target = "_blank";
          link.rel = "noopener";
          link.click();
        }
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const signOut = () => {
    getPb().authStore.clear();
    setAuthed(false);
    setReady(false);
  };

  const hosts = (
    <>
      <ConfirmDialog />
      <Snackbar />
    </>
  );

  if (isPbMode() && !authed) {
    return (
      <>
        {hosts}
        {isCloudMode() ? (
          <div className="cloud-banner">
            Cloud mode — configure billing separately when ready
          </div>
        ) : null}
        <AuthGate
          onAuthed={finishAuth}
          initialMode={authGateMode}
          resetToken={resetToken}
          onConsumedResetToken={() => {
            setResetToken("");
            setAuthGateMode("login");
          }}
        />
        {bootError ? <p className="auth-error">{bootError}</p> : null}
        {booting ? (
          <div className="workspace-boot" role="status" aria-label="Loading workspace">
            <span className="workspace-boot-spinner" />
          </div>
        ) : null}
      </>
    );
  }

  if (isPbMode() && !ready) {
    return (
      <>
        {hosts}
        <div className="workspace-boot" role="status" aria-label="Loading workspace">
          <span className="workspace-boot-spinner" />
        </div>
      </>
    );
  }

  return (
    <>
      {hosts}
      {isCloudMode() ? (
        <div className="cloud-banner cloud-banner--bar">
          <span>Cloud</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const url = import.meta.env.VITE_STRIPE_CHECKOUT_URL;
              if (url) window.open(url, "_blank", "noopener");
              else alert("Billing checkout URL not configured.");
            }}
          >
            Upgrade
          </button>
          {isPbMode() ? (
            <button type="button" className="btn" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="app-frame">
        <App />
      </div>
    </>
  );
}
