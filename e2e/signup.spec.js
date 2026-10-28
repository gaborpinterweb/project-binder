import { expect, test } from "@playwright/test";

test("user can sign up and see verification pending", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page).toHaveURL(/\/pending-verification/);
  await expect(page.locator(".auth-email")).toHaveText(email);
});
