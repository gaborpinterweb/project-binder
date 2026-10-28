import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PB_PORT || "8091";
const baseURL = `http://127.0.0.1:${port}`;

process.env.E2E_PB_PORT ||= port;
process.env.E2E_ADMIN_EMAIL ||= "e2e-admin@example.com";
process.env.E2E_ADMIN_PASSWORD ||= "e2e-admin-password";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/run-e2e-server.cjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      E2E_PB_PORT: port,
      E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
    },
  },
});
