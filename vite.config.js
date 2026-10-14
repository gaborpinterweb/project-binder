import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  plugins: [react()],
  // Baked into the client bundle; display-only — update checks use APP_VERSION semver.
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommitShort()),
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
      // CLI / npm start API (packaged Electron uses 3456)
      "/api": "http://localhost:3457",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
