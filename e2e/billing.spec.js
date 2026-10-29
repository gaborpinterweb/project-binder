import { expect, test } from "@playwright/test";
import { enterApp, uniqueEmail } from "./helpers.js";
import { createVerifiedUser, getUserByEmail } from "./pbAdmin.js";
import {
  polarCheckoutUrl,
  postPolarWebhook,
  subscriptionActivePayload,
} from "./polarWebhook.js";

function paywallDialog(page) {
  return page.getByRole("dialog", {
    name: /unlimited binder for all your freelancing business/i,
  });
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

    const checkout = paywall.getByRole("button", {
      name: /subscribe to cloud pro/i,
    });
    await expect(checkout).toBeEnabled();

    // Block Polar navigation and capture the assign URL via the request.
    const checkoutHost = new URL(polarCheckoutUrl()).host;
    await page.route(
      (url) => url.host === checkoutHost,
      (route) => route.abort(),
    );
    const [request] = await Promise.all([
      page.waitForRequest((req) => {
        try {
          return new URL(req.url()).host === checkoutHost;
        } catch {
          return false;
        }
      }),
      checkout.click(),
    ]);
    const opened = request.url();
    expect(opened).toContain(checkoutHost);
    expect(opened).toMatch(/reference_id=/);
    expect(opened).toMatch(/customer_email=/);
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
