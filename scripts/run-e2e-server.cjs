#!/usr/bin/env node
/**
 * PocketBase + built UI for Playwright.
 * Isolated data dir and port so day-to-day `npm start` (:8090) is untouched.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PB_DIR = path.join(ROOT, "pocketbase");
const BIN_NAME = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const BIN_PATH = path.join(PB_DIR, BIN_NAME);
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(PB_DIR, "pb_public_e2e");
const DATA = path.join(PB_DIR, "pb_data_e2e");
const MIGRATIONS = path.join(PB_DIR, "pb_migrations");
const HOOKS = path.join(PB_DIR, "pb_hooks");
const HOST = "127.0.0.1";
const PORT = process.env.E2E_PB_PORT || "8091";
const HTTP = `http://${HOST}:${PORT}`;
/** E2E-only superuser (not used by npm start / Docker / Fly). */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "e2e-admin-password";


function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

function runNpm(args) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function wipeData() {
  if (!fs.existsSync(DATA)) return;
  console.log(`Wiping ${DATA}…`);
  fs.rmSync(DATA, { recursive: true, force: true });
}

function upsertSuperuser() {
  console.log(`Upserting e2e superuser ${ADMIN_EMAIL}…`);
  const r = spawnSync(
    BIN_PATH,
    ["superuser", "upsert", ADMIN_EMAIL, ADMIN_PASSWORD, `--dir=${DATA}`],
    { cwd: PB_DIR, stdio: "inherit" }
  );
  if (r.status !== 0) {
    console.error("e2e superuser upsert failed");
    process.exit(r.status || 1);
  }
}


runNode(path.join(__dirname, "fetch-pocketbase.cjs"));

if (process.env.E2E_SKIP_BUILD === "1" && fs.existsSync(path.join(DIST, "index.html"))) {
  console.log("E2E_SKIP_BUILD=1 — reusing existing dist/");
} else {
  runNpm(["run", "build"]);
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("build missing dist/index.html");
  process.exit(1);
}

wipeData();
copyDir(DIST, PUBLIC);
fs.mkdirSync(DATA, { recursive: true });
upsertSuperuser();

if (!fs.existsSync(MIGRATIONS)) {
  console.error(`missing migrations dir: ${MIGRATIONS}`);
  process.exit(1);
}

const serveArgs = [
  "serve",
  `--dir=${DATA}`,
  `--publicDir=${PUBLIC}`,
  `--migrationsDir=${MIGRATIONS}`,
  `--http=${HOST}:${PORT}`,
];
if (fs.existsSync(HOOKS)) {
  serveArgs.push(`--hooksDir=${HOOKS}`);
}

console.log(`E2E PocketBase: ${HTTP}`);
console.log(`Data: ${DATA}`);

const child = spawn(BIN_PATH, serveArgs, { cwd: PB_DIR, stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
