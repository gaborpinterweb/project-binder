#!/usr/bin/env node
/**
 * Vite build → pocketbase/pb_public (no PocketBase restart).
 * Use while `npm start` is already serving.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "pocketbase", "pb_public");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["run", "build"], { cwd: ROOT, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("build missing dist/index.html");
  process.exit(1);
}

fs.rmSync(PUBLIC, { recursive: true, force: true });
fs.mkdirSync(PUBLIC, { recursive: true });
fs.cpSync(DIST, PUBLIC, { recursive: true });
console.log(`Updated UI at ${PUBLIC}`);
