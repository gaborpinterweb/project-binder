import { useEffect, useState } from "react";
import { getPb } from "../pb/client.js";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../pb/demoAccount.js";
import { askConfirm } from "../confirmDialog.js";
import { showSnackbar } from "../snackbar.js";
import { APP_NAME } from "../utils.js";

/**
 * @param {{
 *   onAuthed?: () => void,
 *   initialMode?: "login" | "register" | "forgot" | "reset",
 *   resetToken?: string,
 *   onConsumedResetToken?: () => void,
 * }} props
 */
export default function AuthGate({
  onAuthed,
  initialMode = "login",
  resetToken = "",
  onConsumedResetToken,
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (resetToken) {
      setMode("reset");
      setPassword("");
      setPassword2("");
      setError("");
      setInfo("Choose a new password.");
    }
  }, [resetToken]);

  const handleUnverified = async (addr) => {
    const choice = await askConfirm({
      title: "Email not verified",
      message:
        "Confirm your email before signing in. We can send the verification link again, or you can create a new account.",
      confirmLabel: "Send again",
      altLabel: "Create new account",
      cancelLabel: "Cancel",
    });
    if (choice === true) {
      try {
        await getPb().collection("users").requestVerification(addr);
        showSnackbar({
          icon: "check",
          message: "Verification email sent. Check your inbox.",
          durationMs: 5000,
        });
      } catch (err) {
        showSnackbar({
          icon: "bell",
          message: err?.message || "Could not send verification email",
          durationMs: 5000,
        });
      }
    } else if (choice === "alt") {
      setMode("register");
      setPassword("");
      setPassword2("");
      setInfo("");
      setError("");
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
        setMode("login");
        setPassword("");
        setPassword2("");
        setInfo("Password updated. Sign in.");
        showSnackbar({ icon: "check", message: "Password updated. Sign in.", durationMs: 4000 });
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
        try {
          await pb.collection("users").requestVerification(email);
        } catch {
          /* mail may be unset locally */
        }
        setMode("login");
        setPassword("");
        setPassword2("");
        setInfo("Check your email to verify your account, then sign in.");
        showSnackbar({
          icon: "check",
          message: "Account created. Verify your email, then sign in.",
          durationMs: 6000,
        });
        return;
      }

      const auth = await pb.collection("users").authWithPassword(email, password);
      if (!auth?.record?.verified) {
        pb.authStore.clear();
        await handleUnverified(email);
        return;
      }
      onAuthed?.();
    } catch (err) {
      setError(err?.message || String(err) || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "forgot"
      ? "Reset password"
      : mode === "reset"
        ? "Choose new password"
        : mode === "register"
          ? "Create an account"
          : "Sign in to your workspace";

  return (
    <div className="auth-gate">
      <form className="auth-card" onSubmit={submit}>
        <h1>{APP_NAME}</h1>
        <p className="auth-sub">{title}</p>
        {mode === "login" ? (
          <p className="auth-demo-hint">
            Demo: <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code>
          </p>
        ) : null}
        {mode !== "reset" ? (
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
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
                setMode("forgot");
                setError("");
                setInfo("");
              }}
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="auth-switch"
              disabled={busy}
              onClick={() => {
                setMode("register");
                setError("");
                setInfo("");
                setPassword("");
                setPassword2("");
              }}
            >
              Need an account? Register
            </button>
          </>
        ) : (
          <button
            type="button"
            className="auth-switch"
            disabled={busy}
            onClick={() => {
              setMode("login");
              setError("");
              setInfo("");
              onConsumedResetToken?.();
            }}
          >
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}
