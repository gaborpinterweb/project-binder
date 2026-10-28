import { expect, test } from "@playwright/test";
import { createUnverifiedUser } from "./pbAdmin.js";

test("unverified user signing in sees verification instructions", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  await createUnverifiedUser(email, password);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page).toHaveURL(/\/pending-verification/);
  await expect(page.locator(".auth-email")).toHaveText(email);
  await expect(page.getByRole("button", { name: "Resend email" })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: /Project Binder welcome/ })
  ).toHaveCount(0);
});
