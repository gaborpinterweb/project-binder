#!/usr/bin/env node
/**
 * Gated Fly deploy: version/changelog/codename gates → e2e → confirm → fly deploy → verify.
 * Do not run `fly deploy` directly; use: npm run release
 *
 * Usage: node scripts/release.cjs [--force]
 * Requires RELEASE_PROD_URL (env or deploy/release.env).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const semver = require("semver");
const { readReleaseMeta, ROOT } = require("./releaseMeta.cjs");

const FORCE = process.argv.includes("--force");
const PROD_FETCH_MS = 15_000;
const VERIFY_TIMEOUT_MS = 3 * 60_000;
const VERIFY_INTERVAL_MS = 5_000;
const CHANGELOG_HEADING_RE =
  /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2}) \(([^)]+)\)\s*$/;

function fail(message) {
  console.error(`\n[release] ${message}`);
  console.error(
    "[release] Do not run `fly deploy` directly. Use: npm run release\n"
  );
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
    ...opts,
  });
  if (r.error) fail(`${cmd} failed: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} exited ${r.status}`);
}

function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) fail(`${cmd} failed: ${r.error.message}`);
  if (r.status !== 0) {
    fail(`${cmd} ${args.join(" ")} exited ${r.status}: ${r.stderr || ""}`);
  }
  return (r.stdout || "").trim();
}

function loadProdUrl() {
  if (process.env.RELEASE_PROD_URL) {
    return process.env.RELEASE_PROD_URL.replace(/\/$/, "");
  }
  const envPath = path.join(ROOT, "deploy", "release.env");
  if (!fs.existsSync(envPath)) return "";
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^RELEASE_PROD_URL\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v.replace(/\/$/, "");
  }
  return "";
}

function parseChangelog(text) {
  const headings = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "## [Unreleased]") {
      i += 1;
      const bullets = [];
      while (i < lines.length && !lines[i].startsWith("## ")) {
        const t = lines[i].trim();
        if (/^[-*]\s+\S/.test(t)) bullets.push(t);
        i += 1;
      }
      headings.push({ kind: "unreleased", bullets });
      continue;
    }
    const m = CHANGELOG_HEADING_RE.exec(line.trim());
    if (m) {
      headings.push({
        kind: "release",
        version: m[1],
        date: m[2],
        name: m[3].trim(),
      });
      i += 1;
      continue;
    }
    i += 1;
  }
  return headings;
}

function minorKey(version) {
  const p = semver.parse(version);
  if (!p) return "";
  return `${p.major}.${p.minor}`;
}

async function fetchProdVersion(prodUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROD_FETCH_MS);
  try {
    const res = await fetch(`${prodUrl}/version.json`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const data = await res.json();
    const version = typeof data.version === "string" ? data.version.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!semver.valid(version)) {
      return { ok: false, status: res.status, invalid: true };
    }
    return { ok: true, version, name };
  } catch (err) {
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}

function askDeployConfirm(local, prod) {
  if (!process.stdin.isTTY) {
    fail("Refusing to deploy without a TTY. Run interactively and type deploy.");
  }
  const prodLabel = prod?.ok
    ? `${prod.version}${prod.name ? ` (${prod.name})` : ""}`
    : "(unknown / unreachable)";
  console.log("");
  console.log(`[release] Local:  ${local.version} (${local.releaseName})`);
  console.log(`[release] Prod:   ${prodLabel}`);
  console.log(`[release] Target: ${local.prodUrl}`);
  console.log('[release] Type "deploy" to continue (anything else aborts):');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("> ", (answer) => {
      rl.close();
      resolve(String(answer || "").trim() === "deploy");
    });
  });
}

async function verifyProd(prodUrl, expected) {
  const start = Date.now();
  console.log(
    `[release] Waiting for ${prodUrl}/version.json → ${expected.version} (${expected.releaseName})…`
  );
  while (Date.now() - start < VERIFY_TIMEOUT_MS) {
    const prod = await fetchProdVersion(prodUrl);
    if (
      prod.ok &&
      prod.version === expected.version &&
      prod.name === expected.releaseName
    ) {
      console.log("[release] Prod version verified.");
      return;
    }
    await new Promise((r) => setTimeout(r, VERIFY_INTERVAL_MS));
  }
  fail(
    `Prod did not report ${expected.version} (${expected.releaseName}) within ${VERIFY_TIMEOUT_MS / 1000}s`
  );
}

async function main() {
  const prodUrl = loadProdUrl();
  if (!prodUrl) {
    fail(
      "RELEASE_PROD_URL is not set. Export it or copy deploy/release.env.example → deploy/release.env"
    );
  }

  let meta;
  try {
    meta = readReleaseMeta();
  } catch (err) {
    fail(err.message || String(err));
  }
  if (!semver.valid(meta.version)) {
    fail(`Invalid package.json version: ${meta.version}`);
  }

  if (!FORCE) {
    const dirty = runCapture("git", ["status", "--porcelain"]);
    if (dirty) fail("Working tree is dirty. Commit or stash before release.");

    const branch = runCapture("git", ["branch", "--show-current"]);
    if (branch !== "main") {
      fail(`Must be on main (current: ${branch || "(detached)"}).`);
    }

    const changelogPath = path.join(ROOT, "CHANGELOG.md");
    if (!fs.existsSync(changelogPath)) fail("CHANGELOG.md is missing.");
    const changelogText = fs.readFileSync(changelogPath, "utf8");
    const sections = parseChangelog(changelogText);

    const unreleased = sections.find((s) => s.kind === "unreleased");
    if (unreleased && unreleased.bullets.length > 0) {
      fail(
        "[Unreleased] still has bullets. Move them into the versioned section first."
      );
    }

    const match = sections.find(
      (s) => s.kind === "release" && s.version === meta.version
    );
    if (!match) {
      fail(
        `CHANGELOG.md has no section "## [${meta.version}] - YYYY-MM-DD (${meta.releaseName})"`
      );
    }
    if (match.name !== meta.releaseName) {
      fail(
        `CHANGELOG name (${match.name}) does not match package.json releaseName (${meta.releaseName})`
      );
    }

    const localMinor = minorKey(meta.version);
    for (const s of sections) {
      if (s.kind !== "release") continue;
      if (s.name.toLowerCase() !== meta.releaseName.toLowerCase()) continue;
      if (minorKey(s.version) !== localMinor) {
        fail(
          `releaseName "${meta.releaseName}" already used for ${s.version} (different minor). Pick a new tree name.`
        );
      }
    }

    const prod = await fetchProdVersion(prodUrl);
    if (!prod.ok) {
      fail(
        `Could not read ${prodUrl}/version.json (${prod.status || prod.error || "error"}). First ship after adding version.json needs: npm run release -- --force`
      );
    }
    if (!semver.gt(meta.version, prod.version)) {
      fail(
        `Local ${meta.version} is not greater than prod ${prod.version}. Bump package.json version.`
      );
    }
    if (
      minorKey(meta.version) !== minorKey(prod.version) &&
      prod.name &&
      prod.name.toLowerCase() === meta.releaseName.toLowerCase()
    ) {
      fail(
        `New minor must use a new releaseName (prod still reports "${prod.name}").`
      );
    }

    meta._prod = prod;
  } else {
    console.log("[release] --force: skipping git/changelog/version gates.");
    meta._prod = await fetchProdVersion(prodUrl);
  }

  console.log("[release] Running e2e…");
  run("npm", ["run", "test:e2e"]);

  const ok = await askDeployConfirm(
    { ...meta, prodUrl },
    meta._prod
  );
  if (!ok) fail('Confirmation aborted (typed something other than "deploy").');

  console.log("[release] Deploying with fly deploy…");
  run("fly", ["deploy"]);

  await verifyProd(prodUrl, meta);
  console.log("[release] Done.");
}

main().catch((err) => {
  fail(err?.stack || err?.message || String(err));
});
