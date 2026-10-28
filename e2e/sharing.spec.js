import { expect, test } from "@playwright/test";
import {
  addTaskNamed,
  addTasksTab,
  closeTaskDialog,
  createUserProject,
  disablePublicShare,
  enablePublicShare,
  enterApp,
  openProjectCover,
  openProjectOptions,
  openTabOptions,
  openTaskCard,
  taskDialog,
} from "./helpers.js";

async function expectShareShowsTask(page, shareUrl, title, { openTasksTab = false } = {}) {
  await page.goto(shareUrl);
  await expect(
    page.getByRole("heading", { name: "This link is unavailable" })
  ).toHaveCount(0);
  if (openTasksTab) {
    await page.locator("#tabs .tab", { hasText: "Tasks" }).click();
    await expect(page.locator(".board")).toBeVisible();
  }
  await expect(page.locator(".card-name", { hasText: title })).toBeVisible();
}

async function expectShareUnavailable(page, shareUrl) {
  await page.goto(shareUrl);
  await expect(
    page.getByRole("heading", { name: "This link is unavailable" })
  ).toBeVisible();
}

async function renameTask(page, from, to) {
  await openTaskCard(page, from);
  await taskDialog(page).locator("textarea.title").fill(to);
  await closeTaskDialog(page);
  await expect(page.locator(".card-name", { hasText: to })).toBeVisible();
  // Debounced share sync after persist.
  await page.waitForTimeout(1200);
}

test.describe("Sharing smoke", () => {
  test("project share updates for guests, then is unavailable when turned off", async ({
    page,
    browser,
  }) => {
    await enterApp(page, { pro: true });
    const projectName = "Share Project";
    await createUserProject(page, projectName);
    await addTasksTab(page);
    await addTaskNamed(page, "Alpha");

    await openProjectCover(page, projectName);
    await openProjectOptions(page);
    await page.getByRole("menuitem", { name: "Share" }).click();
    const { sharing, url } = await enablePublicShare(page, projectName);
    await sharing.getByRole("button", { name: "Done" }).click();

    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await expectShareShowsTask(guestPage, url, "Alpha", { openTasksTab: true });

      await page.locator("#tabs .tab", { hasText: "Tasks" }).click();
      await expect(page.locator(".board")).toBeVisible();
      await renameTask(page, "Alpha", "Beta");

      await expect
        .poll(
          async () => {
            await guestPage.goto(url);
            await guestPage.locator("#tabs .tab", { hasText: "Tasks" }).click();
            return guestPage.locator(".card-name", { hasText: "Beta" }).count();
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);

      await openProjectCover(page, projectName);
      await openProjectOptions(page);
      await page.getByRole("menuitem", { name: "Share" }).click();
      await disablePublicShare(page, projectName);

      await expectShareUnavailable(guestPage, url);
    } finally {
      await guest.close();
    }
  });

  test("tab share updates for guests, then is unavailable when turned off", async ({
    page,
    browser,
  }) => {
    await enterApp(page, { pro: true });
    const projectName = "Share Tab Project";
    await createUserProject(page, projectName);
    await addTasksTab(page);
    await addTaskNamed(page, "Alpha");

    await openTabOptions(page);
    await page.getByRole("menuitem", { name: "Share" }).click();
    const { sharing, url } = await enablePublicShare(page, "Tasks");
    await sharing.getByRole("button", { name: "Done" }).click();

    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await expectShareShowsTask(guestPage, url, "Alpha");

      await renameTask(page, "Alpha", "Beta");

      await expect
        .poll(
          async () => {
            await guestPage.goto(url);
            return guestPage.locator(".card-name", { hasText: "Beta" }).count();
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);

      await openTabOptions(page);
      await page.getByRole("menuitem", { name: "Share" }).click();
      await disablePublicShare(page, "Tasks");

      await expectShareUnavailable(guestPage, url);
    } finally {
      await guest.close();
    }
  });
});
