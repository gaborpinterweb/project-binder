#!/usr/bin/env node
/**
 * Build UI → pocketbase/pb_public, then serve with the PocketBase binary.
 * App /api still needs `npm start` (Node) until the auth/files spike.
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

runNode(path.join(__dirname, "fetch-pocketbase.cjs"));
runNpm(["run", "build"]);

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

console.log(`Serving UI from ${PUBLIC}`);
console.log(`Migrations: ${MIGRATIONS}`);
console.log("PocketBase: http://127.0.0.1:8090");
console.log("Demo login: demo@projectbinder.local / demodemodemo");

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
