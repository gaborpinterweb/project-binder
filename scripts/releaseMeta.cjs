/**
 * Package release metadata: version + releaseName from package.json.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/**
 * @param {string} [root]
 * @returns {{ version: string, releaseName: string }}
 */
function readReleaseMeta(root = ROOT) {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
  const releaseName =
    typeof pkg.releaseName === "string" ? pkg.releaseName.trim() : "";
  if (!version) {
    throw new Error("package.json missing version");
  }
  if (!releaseName) {
    throw new Error('package.json missing releaseName (e.g. "Pine")');
  }
  return { version, releaseName };
}

module.exports = { readReleaseMeta, ROOT };
