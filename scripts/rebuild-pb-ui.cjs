#!/usr/bin/env node
/**
 * Vite build → pocketbase/pb_public (no PocketBase restart).
 * Use while `npm start` is already serving.
 * Community by default; Commercial when VITE_COMMERCIAL=true|1 or --commercial.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "pocketbase", "pb_public");

const commercial =
  process.env.VITE_COMMERCIAL === "true" ||
  process.env.VITE_COMMERCIAL === "1" ||
  process.argv.includes("--commercial");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const buildScript = commercial ? "build:commercial" : "build";
const env = commercial
  ? { ...process.env, VITE_COMMERCIAL: "true" }
  : process.env;
const r = spawnSync(npm, ["run", buildScript], {
  cwd: ROOT,
  stdio: "inherit",
  env,
});
if (r.status !== 0) process.exit(r.status || 1);

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("build missing dist/index.html");
  process.exit(1);
}

fs.rmSync(PUBLIC, { recursive: true, force: true });
fs.mkdirSync(PUBLIC, { recursive: true });
fs.cpSync(DIST, PUBLIC, { recursive: true });
console.log(`Updated UI at ${PUBLIC} (${commercial ? "Commercial" : "Community"})`);
