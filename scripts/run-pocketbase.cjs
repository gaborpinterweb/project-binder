#!/usr/bin/env node
/**
 * Build UI → pocketbase/pb_public, then serve with the PocketBase binary.
 * Community by default; Commercial when VITE_COMMERCIAL=true|1 or --commercial.
 * If pocketbase/mail.env has RESEND_API_KEY, apply SMTP after health check.
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
const MAIL_ENV = path.join(PB_DIR, "mail.env");
const PB_HTTP = "http://127.0.0.1:8090";

const commercial =
  process.env.VITE_COMMERCIAL === "true" ||
  process.env.VITE_COMMERCIAL === "1" ||
  process.argv.includes("--commercial");

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

function mailEnvHasKey() {
  if (!fs.existsSync(MAIL_ENV)) return false;
  const text = fs.readFileSync(MAIL_ENV, "utf8");
  const m = text.match(/^RESEND_API_KEY=(.*)$/m);
  return !!(m && m[1] && m[1].trim() && !m[1].trim().startsWith("#"));
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

console.log(`Build: ${commercial ? "Commercial" : "Community"}`);
console.log(`Serving UI from ${PUBLIC}`);
console.log(`Migrations: ${MIGRATIONS}`);
console.log("PocketBase: http://127.0.0.1:8090");
console.log("Register an account to sign in (verify email if mail.env is set).");

const child = spawn(
  BIN_PATH,
  [
    "serve",
    `--dir=${DATA}`,
    `--publicDir=${PUBLIC}`,
    `--migrationsDir=${MIGRATIONS}`,
    "--http=127.0.0.1:8090",
  ],
  { cwd: PB_DIR, stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

if (mailEnvHasKey()) {
  waitHealthy()
    .then(() => {
      console.log("Applying Resend mail settings…");
      const r = spawnSync(
        process.execPath,
        [path.join(__dirname, "configure-pb-mail.cjs")],
        { cwd: ROOT, stdio: "inherit" }
      );
      if (r.status !== 0) {
        console.warn("Mail configure failed (app still running). Fix mail.env or run npm run pb:mail");
      }
    })
    .catch((err) => {
      console.warn(String(err.message || err));
    });
}
