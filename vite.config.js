import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const { readReleaseMeta } = require("./scripts/releaseMeta.cjs");

const { version: APP_VERSION, releaseName: APP_RELEASE_NAME } = readReleaseMeta();

/** Short SHA at build/dev start; empty if git is unavailable (e.g. exported tree). */
function gitCommitShort() {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/** Emit /version.json next to the SPA for prod release checks. */
function versionJsonPlugin() {
  return {
    name: "version-json",
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir || path.resolve("dist");
      const payload = JSON.stringify(
        { version: APP_VERSION, name: APP_RELEASE_NAME },
        null,
        2
      );
      fs.writeFileSync(path.join(outDir, "version.json"), `${payload}\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  // Baked into the client bundle; update checks use APP_VERSION semver.
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommitShort()),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_RELEASE_NAME__: JSON.stringify(APP_RELEASE_NAME),
  },
  optimizeDeps: {
    exclude: ["shrimp-doc-viewer"],
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    proxy: {
      // npm start API
      "/api": "http://localhost:3457",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
