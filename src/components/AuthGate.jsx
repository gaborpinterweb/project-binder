import { useState } from "react";
import { getPb } from "../pb/client.js";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../pb/demoAccount.js";
import { APP_NAME } from "../utils.js";

export default function AuthGate({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const pb = getPb();
    try {
      if (mode === "register") {
        if (password !== password2) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
        await pb.collection("users").create({
          email,
          password,
          passwordConfirm: password2,
        });
        await pb.collection("users").authWithPassword(email, password);
      } else {
        await pb.collection("users").authWithPassword(email, password);
      }
      onAuthed?.();
    } catch (err) {
      setError(err?.message || String(err) || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gate">
      <form className="auth-card" onSubmit={submit}>
        <h1>{APP_NAME}</h1>
        <p className="auth-sub">
          {mode === "login" ? "Sign in to your workspace" : "Create an account"}
        </p>
        {mode === "login" ? (
          <p className="auth-demo-hint">
            Demo: <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code>
          </p>
        ) : null}
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
        {mode === "register" && (
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
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="auth-switch"
          disabled={busy}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
