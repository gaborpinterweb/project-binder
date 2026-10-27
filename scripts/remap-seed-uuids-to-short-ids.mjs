/**
 * One-shot: rewrite seedWorkspace.json (+ public copy) and seedUploads/
 * from UUID entity ids to 12-char base62 ids (src/ids.js).
 * Run from repo root: node scripts/remap-seed-uuids-to-short-ids.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seedPath = path.join(root, "seedWorkspace.json");
const publicSeedPath = path.join(root, "public", "seedWorkspace.json");
const uploadsDir = path.join(root, "seedUploads");
const mapPath = path.join(root, "docs", "seed-uuid-to-short-id-map.json");

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ID_LENGTH = 12;
const ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_BYTE_MAX = 256 - (256 % ID_ALPHABET.length);

function newId() {
  let out = "";
  while (out.length < ID_LENGTH) {
    const bytes = crypto.randomBytes(ID_LENGTH - out.length + 4);
    for (const b of bytes) {
      if (b >= ID_BYTE_MAX) continue;
      out += ID_ALPHABET[b % ID_ALPHABET.length];
      if (out.length === ID_LENGTH) break;
    }
  }
  return out;
}

const raw = fs.readFileSync(seedPath, "utf8");
if (!UUID_RE.test(raw)) {
  console.error("No UUIDs found in seedWorkspace.json — already remapped?");
  process.exit(1);
}
UUID_RE.lastIndex = 0;

const found = new Set();
for (const m of raw.matchAll(UUID_RE)) found.add(m[0].toLowerCase());

const map = {};
const used = new Set();
for (const uuid of [...found].sort()) {
  let id;
  do {
    id = newId();
  } while (used.has(id));
  used.add(id);
  map[uuid] = id;
}

function rewriteText(text) {
  return text.replace(UUID_RE, (m) => map[m.toLowerCase()] || m);
}

const nextSeed = rewriteText(raw);
fs.writeFileSync(seedPath, nextSeed);
fs.writeFileSync(publicSeedPath, nextSeed);
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");

/** Rename deepest path segments first so parents still exist when we move children. */
function collectPaths(dir, rel = "") {
  const abs = path.join(dir, rel);
  const ents = fs.readdirSync(abs, { withFileTypes: true });
  const files = [];
  const dirs = [];
  for (const e of ents) {
    const child = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) {
      const nested = collectPaths(dir, child);
      files.push(...nested.files);
      dirs.push(...nested.dirs, child);
    } else {
      files.push(child);
    }
  }
  return { files, dirs };
}

if (fs.existsSync(uploadsDir)) {
  const { files, dirs } = collectPaths(uploadsDir);
  for (const rel of files) {
    const parts = rel.split(path.sep).map((p) => map[p.toLowerCase()] || p);
    const from = path.join(uploadsDir, rel);
    const to = path.join(uploadsDir, ...parts);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (from !== to) fs.renameSync(from, to);
  }
  for (const rel of dirs.sort((a, b) => b.length - a.length)) {
    const abs = path.join(uploadsDir, rel);
    if (fs.existsSync(abs)) {
      try {
        fs.rmdirSync(abs);
      } catch {
        /* non-empty leftover */
      }
    }
  }
}

console.log(
  `Remapped ${Object.keys(map).length} UUIDs → short ids. Map: ${path.relative(root, mapPath)}`
);
