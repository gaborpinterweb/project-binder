import { coerce, gt } from "semver";
import { APP_VERSION } from "./utils.js";

const RELEASES_API =
  "https://api.github.com/repos/gaborpinterweb/project-binder/releases/latest";

/** Fallback / browse-all page when no asset matches this machine. */
export const UPDATE_DOWNLOAD_URL =
  "https://github.com/gaborpinterweb/project-binder/releases";

/** Maps Node/Electron platform → asset filename OS token. */
const OS_TOKEN = {
  darwin: "mac",
  win32: "win",
  linux: "linux",
};

/** Maps Node arch → asset filename arch token. */
const ARCH_TOKEN = {
  arm64: "arm64",
  x64: "x64",
};

/**
 * Release asset names must match:
 *   Project-Binder-<version>-<os>-<arch>.zip
 * e.g. Project-Binder-0.1.0-mac-arm64.zip
 * See AGENTS.md / README “Release assets”.
 */
const ASSET_RE =
  /^Project-Binder-.+-(mac|win|linux)-(arm64|x64)\.zip$/i;

function runtimeTarget() {
  const desktop = typeof window !== "undefined" ? window.desktop : null;
  const platform = desktop?.platform || "";
  const arch = desktop?.arch || "";
  const os = OS_TOKEN[platform];
  const archTok = ARCH_TOKEN[arch];
  if (!os || !archTok) return null;
  return { os, arch: archTok };
}

function pickAssetUrl(assets, target) {
  if (!target || !Array.isArray(assets)) return null;
  const needle = `-${target.os}-${target.arch}.zip`.toLowerCase();
  const match = assets.find((a) => {
    const name = typeof a?.name === "string" ? a.name : "";
    if (!ASSET_RE.test(name)) return false;
    return name.toLowerCase().endsWith(needle);
  });
  return typeof match?.browser_download_url === "string"
    ? match.browser_download_url
    : null;
}

/**
 * Fetch the latest GitHub release and compare with APP_VERSION via semver.
 * @returns {Promise<{
 *   available: boolean,
 *   version?: string,
 *   notes?: string,
 *   url?: string,
 *   releasesUrl?: string,
 *   matched?: boolean,
 * }>}
 */
export async function checkForUpdate() {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { available: false };

    const release = await res.json();
    const latest = coerce(release.tag_name || release.name);
    const current = coerce(APP_VERSION);
    if (!latest || !current) return { available: false };

    if (!gt(latest.version, current.version)) return { available: false };

    const releasesUrl =
      typeof release.html_url === "string" && release.html_url
        ? release.html_url
        : UPDATE_DOWNLOAD_URL;
    const assetUrl = pickAssetUrl(release.assets, runtimeTarget());

    return {
      available: true,
      version: latest.version,
      notes: typeof release.body === "string" ? release.body.trim() : "",
      url: assetUrl || releasesUrl,
      releasesUrl,
      matched: Boolean(assetUrl),
    };
  } catch {
    return { available: false };
  }
}
