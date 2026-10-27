import { useEffect, useState } from "react";
import { getPb } from "../pb/client.js";
import { showSnackbar } from "../snackbar.js";
import { APP_NAME } from "../utils.js";
import { Icon } from "../icons.jsx";
import { authModeToPath, navigatePath } from "../routes.js";

const PENDING_EMAIL_KEY = "project-binder:pendingVerifyEmail";

function readPendingEmail() {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function writePendingEmail(addr) {
  try {
    if (addr) sessionStorage.setItem(PENDING_EMAIL_KEY, addr);
    else sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   onAuthed?: () => void,
 *   initialMode?: "login" | "register" | "forgot" | "reset" | "emailChange" | "pendingVerification",
 *   resetToken?: string,
 *   onConsumedResetToken?: () => void,
 *   emailChangeToken?: string,
 *   onConsumedEmailChangeToken?: () => void,
 *   onModeChange?: (mode: string) => void,
 * }} props
 */
export default function AuthGate({
  onAuthed,
  initialMode = "register",
  resetToken = "",
  onConsumedResetToken,
  emailChangeToken = "",
  onConsumedEmailChangeToken,
  onModeChange,
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(() => readPendingEmail());
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const goMode = (next, { replace = false, clearTokens = false } = {}) => {
    setMode(next);
    setError("");
    if (clearTokens) {
      onConsumedResetToken?.();
      onConsumedEmailChangeToken?.();
    }
    onModeChange?.(next);
    navigatePath(authModeToPath(next), { replace });
  };

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (mode !== "pendingVerification") return;
    if (email) return;
    const fromStore = getPb().authStore.record?.email || "";
    const stored = readPendingEmail();
    const next = stored || fromStore;
    if (next) setEmail(next);
  }, [mode, email]);

  useEffect(() => {
    if (resetToken) {
      setMode("reset");
      setPassword("");
      setPassword2("");
      setError("");
      setInfo("Choose a new password.");
    }
  }, [resetToken]);

  useEffect(() => {
    if (emailChangeToken) {
      setMode("emailChange");
      setPassword("");
      setPassword2("");
      setError("");
      setInfo("Enter your current password to confirm the new email.");
    }
  }, [emailChangeToken]);

  const resendVerification = async (addr) => {
    const target = String(addr || email || "").trim();
    if (!target) {
      showSnackbar({
        icon: "bell",
        tone: "error",
        center: true,
        message: "Missing email address.",
        durationMs: 4000,
      });
      return;
    }
    setBusy(true);
    try {
      await getPb().collection("users").requestVerification(target);
      showSnackbar({
        icon: "check",
        tone: "success",
        center: true,
        message: "Verification email sent. Check your inbox.",
        durationMs: 5000,
      });
    } catch (err) {
      showSnackbar({
        icon: "bell",
        tone: "error",
        center: true,
        message: err?.message || "Could not send verification email",
        durationMs: 5000,
      });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const pb = getPb();
    try {
      if (mode === "forgot") {
        await pb.collection("users").requestPasswordReset(email);
        setInfo("If that email exists, a reset link is on its way.");
        showSnackbar({
          icon: "check",
          tone: "success",
          center: true,
          message: "Password reset email sent (if the account exists).",
          durationMs: 5000,
        });
        return;
      }

      if (mode === "reset") {
        if (!resetToken) throw new Error("Missing reset token");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== password2) throw new Error("Passwords do not match");
        await pb.collection("users").confirmPasswordReset(resetToken, password, password2);
        onConsumedResetToken?.();
        setPassword("");
        setPassword2("");
        setInfo("Password updated. Sign in.");
        goMode("login", { replace: true });
        showSnackbar({
          icon: "check",
          tone: "success",
          center: true,
          message: "Password updated. Sign in.",
          durationMs: 4000,
        });
        return;
      }

      if (mode === "emailChange") {
        if (!emailChangeToken) throw new Error("Missing email change token");
        await pb.collection("users").confirmEmailChange(emailChangeToken, password);
        pb.authStore.clear();
        onConsumedEmailChangeToken?.();
        setPassword("");
        setInfo("Email updated. Sign in with your new email.");
        goMode("login", { replace: true });
        showSnackbar({
          icon: "check",
          tone: "success",
          center: true,
          message: "Email updated. Sign in.",
          durationMs: 5000,
        });
        return;
      }

      if (mode === "register") {
        if (password !== password2) throw new Error("Passwords do not match");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        await pb.collection("users").create({
          email,
          password,
          passwordConfirm: password2,
        });
        // Keep an unverified session so the email link can mark verified and enter the app.
        try {
          await pb.collection("users").authWithPassword(email, password);
        } catch {
          /* pending page + sign-in after verify still work without a local session */
        }
        let mailOk = true;
        try {
          await pb.collection("users").requestVerification(email);
        } catch (err) {
          mailOk = false;
          showSnackbar({
            icon: "bell",
            tone: "error",
            center: true,
            message: err?.message || "Account created, but verification email failed to send.",
            durationMs: 7000,
          });
        }
        writePendingEmail(email);
        setPassword("");
        setPassword2("");
        setInfo("");
        goMode("pendingVerification", { replace: true });
        if (mailOk) {
          showSnackbar({
            icon: "check",
            tone: "success",
            center: true,
            message: "Account created. Check your email to verify.",
            durationMs: 5000,
          });
        }
        return;
      }

      const auth = await pb.collection("users").authWithPassword(email, password);
      if (!auth?.record?.verified) {
        writePendingEmail(email);
        goMode("pendingVerification", { replace: true });
        return;
      }
      writePendingEmail("");
      onAuthed?.();
    } catch (err) {
      setError(err?.message || String(err) || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "pendingVerification") {
    const shownEmail = email || readPendingEmail() || getPb().authStore.record?.email || "";
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-icon" aria-hidden="true">
              <Icon name="mail" size={28} />
            </div>
            <h1>Verify your email</h1>
            <p className="auth-sub">
              {shownEmail ? (
                <>
                  We&apos;ve sent a verification email to
                  <span className="auth-email" title={shownEmail}>
                    {shownEmail}
                  </span>
                  Please click the link to finish your registration.
                </>
              ) : (
                <>
                  We&apos;ve sent a verification email. Please click the link to finish your
                  registration.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            className="auth-submit"
            disabled={busy || !shownEmail}
            onClick={() => resendVerification(shownEmail)}
          >
            {busy ? "…" : "Resend email"}
          </button>
          <button
            type="button"
            className="auth-switch"
            disabled={busy}
            onClick={() => {
              setInfo("");
              goMode("login");
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const title =
    mode === "forgot" || mode === "reset"
      ? "Reset password"
      : mode === "emailChange"
        ? "Confirm email change"
        : mode === "register"
          ? `Welcome to ${APP_NAME}`
          : "Sign in";

  const hideEmail = mode === "reset" || mode === "emailChange";

  return (
    <div className="auth-gate">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img
            className="auth-logo"
            src="/app-icon.png"
            alt={APP_NAME}
            width={56}
            height={56}
            draggable={false}
          />
          <h1>{title}</h1>
        </div>
        {!hideEmail ? (
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        ) : null}
        {mode !== "forgot" ? (
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "login" || mode === "emailChange"
                  ? "current-password"
                  : "new-password"
              }
              required
              placeholder={
                mode === "login" || mode === "emailChange"
                  ? "Your password"
                  : "At least 8 characters"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        ) : null}
        {(mode === "register" || mode === "reset") && (
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              required
              placeholder="Repeat password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </label>
        )}
        {info ? <p className="auth-info">{info}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy
            ? "…"
            : mode === "forgot"
              ? "Send reset link"
              : mode === "reset"
                ? "Update password"
                : mode === "emailChange"
                  ? "Confirm"
                  : mode === "register"
                    ? "Create account"
                    : "Sign in"}
        </button>
        {mode === "login" ? (
          <>
            <button
              type="button"
              className="auth-switch"
              disabled={busy}
              onClick={() => {
                setInfo("");
                goMode("forgot");
              }}
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="auth-switch"
              disabled={busy}
              onClick={() => {
                setInfo("");
                setPassword("");
                setPassword2("");
                goMode("register");
              }}
            >
              Need an account? Sign up
            </button>
          </>
        ) : mode === "register" ? (
          <button
            type="button"
            className="auth-switch"
            disabled={busy}
            onClick={() => {
              setInfo("");
              goMode("login");
            }}
          >
            Already a user? Sign in
          </button>
        ) : (
          <button
            type="button"
            className="auth-switch"
            disabled={busy}
            onClick={() => {
              setInfo("");
              goMode("login", { clearTokens: true });
            }}
          >
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}
