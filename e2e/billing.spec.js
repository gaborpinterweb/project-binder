import { expect, test } from "@playwright/test";
import { enterApp, uniqueEmail } from "./helpers.js";
import { createVerifiedUser, getUserByEmail } from "./pbAdmin.js";
import {
  polarCheckoutUrl,
  postPolarWebhook,
  subscriptionActivePayload,
} from "./polarWebhook.js";

function paywallDialog(page) {
  return page.getByRole("dialog", { name: /unlimited room to grow/i });
}

test.describe("Billing", () => {
  test("Settings ?tab=billing deep link opens Billing and clears on close", async ({
    page,
  }) => {
    await enterApp(page);
    await page.goto("/settings?tab=billing");
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByText("Cloud Free", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/settings\?tab=billing/);

    await settings.getByRole("tab", { name: "Data" }).click();
    await expect(page).toHaveURL(/\/settings\?tab=data/);

    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]tab=/);
  });

  test("Settings billing opens paywall with checkout link to the payment provider", async ({
    page,
  }) => {
    await enterApp(page);

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Billing" }).click();
    await expect(settings.getByText("Cloud Free", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/settings\?tab=billing/);

    await settings.getByRole("button", { name: "Get Cloud Pro" }).click();
    const paywall = paywallDialog(page);
    await expect(paywall).toBeVisible();

    const checkout = paywall.getByRole("button", { name: "Checkout" });
    await expect(checkout).toBeEnabled();

    // Stub window.open so we assert the checkout URL without following Polar redirects.
    await page.evaluate(() => {
      window.__pbCheckoutUrls = [];
      window.open = (url) => {
        window.__pbCheckoutUrls.push(String(url || ""));
        return null;
      };
    });
    await checkout.click();
    const opened = await page.evaluate(() => window.__pbCheckoutUrls || []);
    expect(opened.length).toBe(1);
    expect(opened[0]).toContain(new URL(polarCheckoutUrl()).host);
    expect(opened[0]).toMatch(/reference_id=/);
    expect(opened[0]).toMatch(/customer_email=/);
  });

  test("valid subscribe webhook marks the user Pro", async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email, "password123");
    const before = await getUserByEmail(email);
    expect(before.pro).toBeFalsy();

    const result = await postPolarWebhook({
      payload: subscriptionActivePayload({
        userId: before.id,
        email,
      }),
      validSignature: true,
    });
    expect(result.status).toBe(200);
    expect(result.data?.pro).toBe(true);

    const after = await getUserByEmail(email);
    expect(after.pro).toBe(true);
    expect(String(after.proStatus || "").toLowerCase()).toBe("active");
  });

  test("invalid subscribe webhook does not mark the user Pro", async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email, "password123");
    const before = await getUserByEmail(email);
    expect(before.pro).toBeFalsy();

    const result = await postPolarWebhook({
      payload: subscriptionActivePayload({
        userId: before.id,
        email,
      }),
      validSignature: false,
    });
    expect(result.status).toBe(401);
    expect(result.data?.pro).not.toBe(true);

    const after = await getUserByEmail(email);
    expect(after.pro).toBeFalsy();
  });
});
