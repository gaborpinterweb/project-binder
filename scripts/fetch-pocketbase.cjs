#!/usr/bin/env node
/**
 * Download a pinned PocketBase binary into pocketbase/ if missing.
 */
const fs = require("fs");
const https = require("https");
const path = require("path");

const PB_VERSION = "0.40.5";
const ROOT = path.join(__dirname, "..");
const PB_DIR = path.join(ROOT, "pocketbase");
const BIN_NAME = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const BIN_PATH = path.join(PB_DIR, BIN_NAME);

function platformArch() {
  const os =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "windows"
        : "linux";
  let arch = process.arch;
  if (arch === "x64") arch = "amd64";
  else if (arch === "arm") arch = "armv7";
  // arm64 stays arm64
  return { os, arch };
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      https
        .get(u, (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`download failed: HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", reject);
    };
    get(url);
  });
}

async function main() {
  if (fs.existsSync(BIN_PATH)) {
    console.log(`PocketBase already present: ${BIN_PATH}`);
    return;
  }

  fs.mkdirSync(PB_DIR, { recursive: true });
  const { os, arch } = platformArch();
  const zipName = `pocketbase_${PB_VERSION}_${os}_${arch}.zip`;
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${zipName}`;
  const zipPath = path.join(PB_DIR, zipName);

  console.log(`Fetching PocketBase v${PB_VERSION} (${os}/${arch})…`);
  console.log(url);
  await download(url, zipPath);

  const AdmZip = require("adm-zip");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(PB_DIR, true);
  fs.rmSync(zipPath, { force: true });

  if (!fs.existsSync(BIN_PATH)) {
    throw new Error(`expected binary missing after extract: ${BIN_PATH}`);
  }
  if (process.platform !== "win32") {
    fs.chmodSync(BIN_PATH, 0o755);
  }
  console.log(`PocketBase ready: ${BIN_PATH}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
