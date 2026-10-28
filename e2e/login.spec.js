import { expect, test } from "@playwright/test";
import {
  createUnverifiedUser,
  createVerifiedUser,
  markUserVerified,
} from "./pbAdmin.js";

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function signIn(page, email, password) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function dismissOnboarding(page) {
  const dialog = page.getByRole("dialog", { name: /Project Binder welcome/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Let's go" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("Login", () => {
  test("user can sign up and see verification pending", async ({ page }) => {
    const email = uniqueEmail();
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

  test("user can register, log in, and see onboarding", async ({ page }) => {
    const email = uniqueEmail();
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
    await expect(
      page.getByRole("heading", { name: "Welcome to Project Binder" })
    ).toBeVisible();
  });

  test("unverified user signing in sees verification instructions", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password123";

    await createUnverifiedUser(email, password);
    await signIn(page, email, password);

    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    await expect(page).toHaveURL(/\/pending-verification/);
    await expect(page.locator(".auth-email")).toHaveText(email);
    await expect(page.getByRole("button", { name: "Resend email" })).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: /Project Binder welcome/ })
    ).toHaveCount(0);
  });

  test("login screen should have password reset link", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  });

  test("login screen should have sign up link", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Need an account? Sign up" }).click();
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(
      page.getByRole("heading", { name: "Welcome to Project Binder" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("sign up screen should have login link", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByRole("button", { name: "Already a user? Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("onboarding dialog should be shown once per user", async ({ browser, page }) => {
    const email = uniqueEmail();
    const password = "password123";
    await createVerifiedUser(email, password);

    await signIn(page, email, password);
    await dismissOnboarding(page);
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();

    const incognito = await browser.newContext();
    try {
      const page2 = await incognito.newPage();
      await signIn(page2, email, password);
      await expect(page2.getByRole("button", { name: "Settings" })).toBeVisible();
      await expect(
        page2.getByRole("dialog", { name: /Project Binder welcome/ })
      ).toHaveCount(0);
    } finally {
      await incognito.close();
    }
  });

  test("user should be able to sign out", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password123";
    await createVerifiedUser(email, password);

    await signIn(page, email, password);
    await dismissOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Account" }).click();
    await settings.getByRole("button", { name: "Sign out" }).click();

    await page.getByRole("alertdialog").getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/sign-up/);
    await expect(
      page.getByRole("heading", { name: "Welcome to Project Binder" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
});
