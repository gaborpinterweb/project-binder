import { expect, test } from "@playwright/test";
import { enterApp } from "./helpers.js";
import { setUserPro } from "./pbAdmin.js";

/** Confirm-pro card (not the dimmed overlay). */
function confirmProDlg(page) {
  return page.locator(".dlg.confirm-pro-dlg");
}

/** Click the backdrop; dialog must stay open (Continue-only / button dismiss). */
async function clickConfirmProOverlay(page) {
  await page.locator(".ov.ov-confirm-pro").click({
    position: { x: 10, y: 10 },
    force: true,
  });
}

test.describe("Confirm Pro dialog", () => {
  test("pending confirmation is not closable via overlay", async ({ page }) => {
    await enterApp(page);
    await page.goto("/confirm-pro?checkout_id=e2e_pending");
    const dlg = confirmProDlg(page);
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByText("Confirming your Cloud Pro access...")
    ).toBeVisible();

    await clickConfirmProOverlay(page);
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByText("Confirming your Cloud Pro access...")
    ).toBeVisible();
  });

  test("non-Pro user reaches failed state after timeout; overlay stays locked", async ({
    page,
  }) => {
    await enterApp(page);
    await page.goto("/confirm-pro?checkout_id=e2e_fail");
    const dlg = confirmProDlg(page);
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByText("Confirming your Cloud Pro access...")
    ).toBeVisible();

    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(dlg.getByText(/timed out/i)).toBeVisible();
    await expect(dlg.locator("code")).toHaveText("e2e_fail");

    await clickConfirmProOverlay(page);
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible();
  });

  test("failed state has Refresh, Contact us, and Close", async ({ page }) => {
    await enterApp(page);
    await page.goto("/confirm-pro?checkout_id=e2e_actions");
    const dlg = confirmProDlg(page);
    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible({ timeout: 15_000 });

    await expect(dlg.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Contact us" })).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Close" })).toBeVisible();
  });

  test("Refresh starts polling again", async ({ page }) => {
    await enterApp(page);
    await page.goto("/confirm-pro?checkout_id=e2e_refresh");
    const dlg = confirmProDlg(page);
    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible({ timeout: 15_000 });

    await dlg.getByRole("button", { name: "Refresh" }).click();
    await expect(
      dlg.getByText("Confirming your Cloud Pro access...")
    ).toBeVisible();
    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toHaveCount(0);

    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Contact us opens the feedback form", async ({ page }) => {
    await enterApp(page);
    await page.goto("/confirm-pro?checkout_id=e2e_contact");
    const dlg = confirmProDlg(page);
    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible({ timeout: 15_000 });

    const popupPromise = page.waitForEvent("popup");
    await dlg.getByRole("button", { name: "Contact us" }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/projectbinder\.app\/feedback/);
    await popup.close();
  });

  test("Close dismisses the failed dialog", async ({ page }) => {
    await enterApp(page);
    await page.goto("/confirm-pro?checkout_id=e2e_close");
    const dlg = confirmProDlg(page);
    await expect(
      dlg.getByRole("heading", { name: /cloud pro confirmation failed/i })
    ).toBeVisible({ timeout: 15_000 });

    await dlg.getByRole("button", { name: "Close" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page).not.toHaveURL(/confirm-pro/);
  });

  test("Pro user (DB entitlement) sees success; overlay locked; Continue closes", async ({
    page,
  }) => {
    const { email } = await enterApp(page, { pro: true });
    // Entitlement comes from PocketBase `users.pro`, not a query-param emulate.
    await setUserPro(email, true);

    await page.goto("/confirm-pro?checkout_id=e2e_success");
    const dlg = confirmProDlg(page);
    await expect(
      dlg.getByRole("heading", { name: /cloud pro plan confirmed/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(dlg.getByText("Unlimited active projects")).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Continue" })).toBeVisible();

    await clickConfirmProOverlay(page);
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByRole("heading", { name: /cloud pro plan confirmed/i })
    ).toBeVisible();

    await dlg.getByRole("button", { name: "Continue" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page).not.toHaveURL(/confirm-pro/);
  });
});
