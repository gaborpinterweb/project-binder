import { coerce, gt } from "semver";
import { APP_VERSION } from "./utils.js";

const RELEASES_API =
  "https://api.github.com/repos/gaborpinterweb/project-binder/releases/latest";

/** Browse-all page for updates (web builds; no desktop zip matching). */
export const UPDATE_DOWNLOAD_URL =
  "https://github.com/gaborpinterweb/project-binder/releases";

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

    return {
      available: true,
      version: latest.version,
      notes: typeof release.body === "string" ? release.body.trim() : "",
      url: releasesUrl,
      releasesUrl,
      matched: false,
    };
  } catch {
    return { available: false };
  }
}
