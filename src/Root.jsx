import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import App from "./App.jsx";
import AuthGate from "./components/AuthGate.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import PaywallDialog from "./components/PaywallDialog.jsx";
import ShareViewer from "./components/ShareViewer.jsx";
import Snackbar from "./components/Snackbar.jsx";
import { getPb, isPbMode } from "./pb/client.js";
import { loadUserDocs, saveUserDocs } from "./pb/persist.js";
import { workspaceEngine } from "./engine/workspaceEngine.js";
import { ensurePersistHook } from "./engine/apiBridge.js";
import { showSnackbar } from "./snackbar.js";
import {
  AUTH_RESET_PASSWORD,
  AUTH_SIGN_IN,
  AUTH_SIGN_UP,
  currentPathname,
  navigatePath,
  parsePath,
  pathToAuthMode,
} from "./routes.js";

function readShareId() {
  const parsed = parsePath(currentPathname());
  return parsed?.kind === "share" ? parsed.shareId : "";
}

function readAuthParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    verify: q.get("verify") || "",
    reset: q.get("reset") || "",
    emailChange: q.get("emailChange") || "",
  };
}

function clearAuthParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("verify");
  url.searchParams.delete("reset");
  url.searchParams.delete("emailChange");
  const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
  window.history.replaceState({}, "", next);
}

function modeFromLocation() {
  const { reset, emailChange } = readAuthParams();
  if (emailChange) return "emailChange";
  if (reset) return "reset";
  return pathToAuthMode(currentPathname()) || "register";
}

/**
 * Logged out: `/` and any non-auth app path → `/sign-up`.
 * Keep `/sign-in`, `/sign-up`, `/reset-password`, `/pending-verification` as-is.
 * @returns {string} AuthGate mode after sync
 */
function redirectLoggedOutToSignUp() {
  const { verify, reset, emailChange } = readAuthParams();
  if (verify || reset || emailChange) return modeFromLocation();
  const mode = pathToAuthMode(currentPathname());
  if (mode) return mode;
  navigatePath(AUTH_SIGN_UP, { replace: true });
  return "register";
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
  const [shareId, setShareId] = useState(() => readShareId());
  const [ready, setReady] = useState(!isPbMode());
  const [authed, setAuthed] = useState(() => {
    if (!isPbMode()) return true;
    if (readShareId()) return false;
    const { verify, reset, emailChange } = readAuthParams();
    // Token links must run through the boot effect before treating the session as ready.
    if (verify || reset || emailChange) return false;
    return sessionIsVerified();
  });
  const [bootError, setBootError] = useState("");
  const [booting, setBooting] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [emailChangeToken, setEmailChangeToken] = useState("");
  const [authGateMode, setAuthGateMode] = useState(() => modeFromLocation());

  useEffect(() => {
    const onPop = () => {
      setShareId(readShareId());
      if (!sessionIsVerified() && isPbMode() && !readShareId()) {
        setAuthGateMode(redirectLoggedOutToSignUp());
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Address bar: logged-out non-auth paths become /sign-up before paint.
  useLayoutEffect(() => {
    if (!isPbMode() || authed || shareId) return;
    setAuthGateMode(redirectLoggedOutToSignUp());
  }, [authed, shareId]);

  const finishAuth = useCallback(async () => {
    setBooting(true);
    setBootError("");
    try {
      if (!sessionIsVerified()) {
        getPb().authStore.clear();
        setAuthed(false);
        setReady(false);
        setAuthGateMode(redirectLoggedOutToSignUp());
        return;
      }
      await bootstrapPbSession();
      setAuthed(true);
      setReady(true);
      // Leave auth URLs so App can canonicalize to the workspace.
      if (parsePath(currentPathname())?.kind === "auth") {
        navigatePath("/master-board", { replace: true });
      }
    } catch (err) {
      setBootError(err?.message || String(err));
      setAuthed(false);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    if (!isPbMode()) return;
    if (shareId) return;
    let cancelled = false;
    (async () => {
      const { verify, reset, emailChange } = readAuthParams();
      if (verify) {
        try {
          await getPb().collection("users").confirmVerification(verify);
          if (cancelled) return;
          clearAuthParams();
          // SDK marks authStore.record.verified when an unverified session matches the token.
          if (sessionIsVerified()) {
            showSnackbar({
              icon: "check",
              tone: "success",
              center: true,
              message: "Email verified.",
              durationMs: 4000,
            });
            await finishAuth();
            return;
          }
          showSnackbar({
            icon: "check",
            tone: "success",
            center: true,
            message: "Email verified. Sign in to continue.",
            durationMs: 5000,
          });
          setAuthGateMode("login");
          navigatePath(AUTH_SIGN_IN, { replace: true });
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
          if (sessionIsVerified()) {
            await finishAuth();
            return;
          }
          setAuthGateMode("login");
          navigatePath(AUTH_SIGN_IN, { replace: true });
        }
        return;
      }
      if (reset) {
        clearAuthParams();
        setResetToken(reset);
        setAuthGateMode("reset");
        navigatePath(AUTH_RESET_PASSWORD, { replace: true });
        return;
      }
      if (emailChange) {
        getPb().authStore.clear();
        clearAuthParams();
        setAuthed(false);
        setReady(false);
        setEmailChangeToken(emailChange);
        setAuthGateMode("emailChange");
        navigatePath(AUTH_SIGN_IN, { replace: true });
        return;
      }
      if (sessionIsVerified()) {
        await finishAuth();
        return;
      }
      if (getPb().authStore.isValid) {
        getPb().authStore.clear();
      }
      if (cancelled) return;
      setAuthGateMode(redirectLoggedOutToSignUp());
    })();
    return () => {
      cancelled = true;
    };
  }, [finishAuth, shareId]);

  useEffect(() => {
    if (!shareId && !isPbMode()) return;
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
  }, [shareId]);

  const hosts = (
    <>
      <ConfirmDialog />
      <PaywallDialog />
      <Snackbar />
    </>
  );

  if (shareId) {
    return (
      <>
        {hosts}
        <ShareViewer shareId={shareId} />
      </>
    );
  }

  if (isPbMode() && !authed) {
    return (
      <>
        {hosts}
        <AuthGate
          onAuthed={finishAuth}
          initialMode={authGateMode}
          resetToken={resetToken}
          onModeChange={setAuthGateMode}
          onConsumedResetToken={() => {
            setResetToken("");
            setAuthGateMode("login");
          }}
          emailChangeToken={emailChangeToken}
          onConsumedEmailChangeToken={() => {
            setEmailChangeToken("");
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
      <div className="app-frame">
        <App />
      </div>
    </>
  );
}
