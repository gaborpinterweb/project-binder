import { expect, test } from "@playwright/test";
import { enterApp, signIn } from "./helpers.js";

/**
 * Runs last (zz- prefix) so deleted-user side effects cannot affect other specs.
 */
test.describe("Delete account", () => {
  test("Pro user must cancel subscription before delete is offered", async ({
    page,
  }) => {
    await enterApp(page, { pro: true });

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Account" }).click();
    await settings.getByRole("button", { name: "Delete account" }).click();

    const dialog = page.getByRole("dialog", {
      name: "Permanently delete your account?",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        /Cancel your Polar subscription before deleting this account/
      )
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Manage subscription" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Refresh status" })
    ).toBeVisible();
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Permanently delete" })
    ).toHaveCount(0);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  });

  test("user can permanently delete their account and cannot sign in again", async ({
    page,
  }) => {
    const { email, password } = await enterApp(page);

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Account" }).click();
    await settings.getByRole("button", { name: "Delete account" }).click();

    const dialog = page.getByRole("dialog", {
      name: "Permanently delete your account?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").fill("delete forever");
    await dialog.getByRole("button", { name: "Permanently delete" }).click();

    await expect(page).toHaveURL(/\/sign-(up|in)/);
    await expect(
      page.getByRole("heading", {
        name: /Welcome to Project Binder|Sign in/,
      })
    ).toBeVisible();

    await signIn(page, email, password);
    await expect(page.locator(".auth-error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  });
});
