#!/usr/bin/env node
/**
 * Container entrypoint: upsert superuser, serve PocketBase on $PORT, apply Resend mail.
 * Persists SQLite + files under DATA_DIR (default /data — Fly volume).
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BIN = path.join(ROOT, "pocketbase", "pocketbase");
const PUBLIC = path.join(ROOT, "pocketbase", "pb_public");
const MIGRATIONS = path.join(ROOT, "pocketbase", "pb_migrations");
const HOOKS = path.join(ROOT, "pocketbase", "pb_hooks");
const DATA_DIR = process.env.DATA_DIR || "/data";
const PORT = String(process.env.PORT || "8090");

function log(...args) {
  console.log("[entrypoint]", ...args);
}

function upsertSuperuser() {
  const email = process.env.PB_ADMIN_EMAIL || "";
  const password = process.env.PB_ADMIN_PASSWORD || "";
  if (!email || !password) {
    log("PB_ADMIN_EMAIL/PASSWORD unset — skip superuser upsert");
    return;
  }
  log("Upserting superuser…");
  const r = spawnSync(
    BIN,
    ["superuser", "upsert", email, password, `--dir=${DATA_DIR}`],
    { stdio: "inherit" }
  );
  if (r.status !== 0) {
    console.error("[entrypoint] superuser upsert failed (continuing)");
  }
}

async function waitHealthy(baseUrl, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("health check timed out");
}

async function applyMail(localBase) {
  if (!process.env.RESEND_API_KEY) {
    log("RESEND_API_KEY unset — skip mail configure");
    return;
  }
  log("Applying Resend mail settings…");
  const env = {
    ...process.env,
    PB_URL: localBase,
    APP_URL: (process.env.APP_URL || localBase).replace(/\/$/, ""),
  };
  const r = spawnSync(process.execPath, [path.join(__dirname, "configure-pb-mail.cjs")], {
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.warn("[entrypoint] mail configure failed (app still running)");
  }
}

function main() {
  if (!fs.existsSync(BIN)) {
    console.error("[entrypoint] missing PocketBase binary:", BIN);
    process.exit(1);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  upsertSuperuser();

  const args = [
    "serve",
    `--http=0.0.0.0:${PORT}`,
    `--dir=${DATA_DIR}`,
    `--publicDir=${PUBLIC}`,
    `--migrationsDir=${MIGRATIONS}`,
  ];
  if (fs.existsSync(HOOKS)) {
    args.push(`--hooksDir=${HOOKS}`);
  }
  log("Starting PocketBase:", args.join(" "));

  const child = spawn(BIN, args, { stdio: "inherit" });

  const shutdown = (signal) => {
    child.kill(signal);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });

  const localBase = `http://127.0.0.1:${PORT}`;
  waitHealthy(localBase)
    .then(() => applyMail(localBase))
    .catch((err) => console.warn("[entrypoint]", err.message || err));
}

main();
