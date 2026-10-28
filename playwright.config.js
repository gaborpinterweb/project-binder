import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PB_PORT || "8091";
const baseURL = `http://127.0.0.1:${port}`;

process.env.E2E_PB_PORT ||= port;
process.env.E2E_ADMIN_EMAIL ||= "e2e-admin@example.com";
process.env.E2E_ADMIN_PASSWORD ||= "e2e-admin-password";
process.env.E2E_POLAR_CHECKOUT_URL ||= "https://buy.polar.sh/e2e-test-checkout";
process.env.E2E_POLAR_PORTAL_URL ||= "https://polar.sh/e2e/portal";
process.env.E2E_POLAR_WEBHOOK_SECRET ||= "e2e_polar_webhook_secret";

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
      E2E_POLAR_CHECKOUT_URL: process.env.E2E_POLAR_CHECKOUT_URL,
      E2E_POLAR_PORTAL_URL: process.env.E2E_POLAR_PORTAL_URL,
      E2E_POLAR_WEBHOOK_SECRET: process.env.E2E_POLAR_WEBHOOK_SECRET,
    },
  },
});
