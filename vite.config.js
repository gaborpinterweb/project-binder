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
      "/api": "http://localhost:3456",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
