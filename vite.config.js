import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
