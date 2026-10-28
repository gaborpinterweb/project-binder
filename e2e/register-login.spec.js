import { expect, test } from "@playwright/test";
import { markUserVerified } from "./pbAdmin.js";

test("user can register, log in, and see onboarding", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

  await markUserVerified(email);

  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("dialog", { name: /Project Binder welcome/ })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to Project Binder" })).toBeVisible();
});
