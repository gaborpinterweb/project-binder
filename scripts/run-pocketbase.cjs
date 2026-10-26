#!/usr/bin/env node
/**
 * Build UI → pocketbase/pb_public, then serve with the PocketBase binary.
 * Community by default; Commercial when VITE_COMMERCIAL=true|1 or --commercial.
 * --wipe: delete pb_data first (fresh migrations). Stop any running PB first.
 * If pocketbase/mail.env has RESEND_API_KEY + PB_ADMIN_*, upsert superuser and apply SMTP.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PB_DIR = path.join(ROOT, "pocketbase");
const BIN_NAME = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const BIN_PATH = path.join(PB_DIR, BIN_NAME);
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(PB_DIR, "pb_public");
const DATA = path.join(PB_DIR, "pb_data");
const MIGRATIONS = path.join(PB_DIR, "pb_migrations");
const HOOKS = path.join(PB_DIR, "pb_hooks");
const MAIL_ENV = path.join(PB_DIR, "mail.env");
const PB_HTTP = "http://127.0.0.1:8090";

const commercial =
  process.env.VITE_COMMERCIAL === "true" ||
  process.env.VITE_COMMERCIAL === "1" ||
  process.argv.includes("--commercial");
const wipe = process.argv.includes("--wipe");

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

function runNpm(args, env = process.env) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, args, { cwd: ROOT, stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status || 1);
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function mailCfg() {
  const file = parseEnvFile(MAIL_ENV);
  const g = (k) =>
    process.env[k] != null && process.env[k] !== "" ? process.env[k] : file[k] || "";
  return {
    apiKey: g("RESEND_API_KEY"),
    adminEmail: g("PB_ADMIN_EMAIL"),
    adminPassword: g("PB_ADMIN_PASSWORD"),
  };
}

function wipeData() {
  if (!fs.existsSync(DATA)) {
    console.log(`No pb_data yet at ${DATA}`);
    return;
  }
  console.log(`Wiping ${DATA}…`);
  try {
    fs.rmSync(DATA, { recursive: true, force: false });
  } catch (err) {
    console.error(
      `Could not delete pb_data (${err.code || err.message}). Stop npm start / PocketBase first, then retry.`
    );
    process.exit(1);
  }
}

function upsertSuperuser(cfg) {
  if (!cfg.adminEmail || !cfg.adminPassword) {
    console.warn(
      "PB_ADMIN_EMAIL/PASSWORD missing in mail.env — skip superuser upsert (mail configure will fail until you create one at /_/)."
    );
    return;
  }
  fs.mkdirSync(DATA, { recursive: true });
  console.log(`Upserting superuser ${cfg.adminEmail}…`);
  const r = spawnSync(
    BIN_PATH,
    ["superuser", "upsert", cfg.adminEmail, cfg.adminPassword, `--dir=${DATA}`],
    { cwd: PB_DIR, stdio: "inherit" }
  );
  if (r.status !== 0) {
    console.error("superuser upsert failed");
    process.exit(r.status || 1);
  }
}

async function waitHealthy(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${PB_HTTP}/api/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("PocketBase health check timed out");
}

function applyMail() {
  console.log("Applying Resend mail settings…");
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, "configure-pb-mail.cjs")],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (r.status !== 0) {
    console.warn(
      "Mail configure failed (app still running). Fix mail.env or run npm run pb:mail"
    );
  }
}

const cfg = mailCfg();

if (wipe) wipeData();

runNode(path.join(__dirname, "fetch-pocketbase.cjs"));
if (commercial) {
  runNpm(["run", "build:commercial"], {
    ...process.env,
    VITE_COMMERCIAL: "true",
  });
} else {
  runNpm(["run", "build"]);
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("build missing dist/index.html");
  process.exit(1);
}

copyDir(DIST, PUBLIC);
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(MIGRATIONS)) {
  console.error(`missing migrations dir: ${MIGRATIONS}`);
  process.exit(1);
}

if (wipe || cfg.adminEmail) {
  upsertSuperuser(cfg);
}

console.log(`Build: ${commercial ? "Commercial" : "Community"}`);
console.log(`Serving UI from ${PUBLIC}`);
console.log(`Migrations: ${MIGRATIONS}`);
console.log("PocketBase: http://127.0.0.1:8090");
console.log("Register an account to sign in (verify email if mail.env is set).");

const serveArgs = [
  "serve",
  `--dir=${DATA}`,
  `--publicDir=${PUBLIC}`,
  `--migrationsDir=${MIGRATIONS}`,
  "--http=127.0.0.1:8090",
];
if (fs.existsSync(HOOKS)) {
  serveArgs.push(`--hooksDir=${HOOKS}`);
  console.log(`Hooks: ${HOOKS}`);
}

const child = spawn(BIN_PATH, serveArgs, { cwd: PB_DIR, stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

if (cfg.apiKey) {
  waitHealthy()
    .then(() => applyMail())
    .catch((err) => {
      console.warn(String(err.message || err));
    });
} else if (wipe) {
  console.warn(
    "RESEND_API_KEY empty in mail.env — skipped mail configure. Fill mail.env and run npm run pb:mail."
  );
}
