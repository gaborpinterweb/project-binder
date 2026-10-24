import { useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import AuthGate from "./components/AuthGate.jsx";
import { getPb, isPbMode, isCloudMode } from "./pb/client.js";
import { loadUserDocs, saveUserDocs } from "./pb/persist.js";
import { workspaceEngine } from "./engine/workspaceEngine.js";
import { ensurePersistHook } from "./engine/apiBridge.js";

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

export default function Root() {
  const [ready, setReady] = useState(!isPbMode());
  const [authed, setAuthed] = useState(() => {
    if (!isPbMode()) return true;
    return getPb().authStore.isValid;
  });
  const [bootError, setBootError] = useState("");
  const [booting, setBooting] = useState(false);

  const finishAuth = useCallback(async () => {
    setBooting(true);
    setBootError("");
    try {
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
    if (getPb().authStore.isValid) {
      finishAuth();
    }
  }, [finishAuth]);

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

  if (isPbMode() && !authed) {
    return (
      <>
        {isCloudMode() ? (
          <div className="cloud-banner">
            Cloud mode — paid plans via Stripe (configure VITE_STRIPE_CHECKOUT_URL)
          </div>
        ) : null}
        <AuthGate onAuthed={finishAuth} />
        {bootError ? <p className="auth-error">{bootError}</p> : null}
        {booting ? <p className="auth-booting">Loading workspace…</p> : null}
      </>
    );
  }

  if (isPbMode() && !ready) {
    return <p className="auth-booting">Loading workspace…</p>;
  }

  return (
    <>
      {isCloudMode() ? (
        <div className="cloud-banner cloud-banner--bar">
          <span>Cloud</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const url = import.meta.env.VITE_STRIPE_CHECKOUT_URL;
              if (url) window.open(url, "_blank", "noopener");
              else alert("Set VITE_STRIPE_CHECKOUT_URL for Stripe Checkout (test mode).");
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
