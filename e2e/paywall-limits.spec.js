import { expect, test } from "@playwright/test";
import {
  createUserProject,
  enterApp,
  openProjectCover,
  openProjectOptions,
  projectList,
} from "./helpers.js";

function paywallDialog(page) {
  return page.getByRole("dialog", { name: /unlimited room to grow/i });
}

test.describe("Paywall limits (Commercial Free)", () => {
  test("fourth active project opens the paywall", async ({ page }) => {
    await enterApp(page);
    await createUserProject(page, "Free One");
    await createUserProject(page, "Free Two", { clearDemos: false });
    await createUserProject(page, "Free Three", { clearDemos: false });
    await expect(projectList(page).getByRole("button")).toHaveCount(3);

    await page.getByRole("button", { name: "New project" }).click();

    const paywall = paywallDialog(page);
    await expect(paywall).toBeVisible();
    await expect(paywall.getByText("Cloud Free", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Project name...")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(paywall).toHaveCount(0);
    await expect(projectList(page).getByRole("button")).toHaveCount(3);
  });

  test("public share on Free opens the paywall", async ({ page }) => {
    await enterApp(page);
    await createUserProject(page, "Share Blocked");
    await openProjectCover(page, "Share Blocked");
    await openProjectOptions(page);
    await page.getByRole("menuitem", { name: "Share" }).click();

    const sharing = page.getByRole("dialog", {
      name: "Sharing for Share Blocked",
    });
    await expect(sharing).toBeVisible();
    await sharing.getByRole("radio", { name: "Public read-only link" }).click();

    const paywall = paywallDialog(page);
    await expect(paywall).toBeVisible();
    await expect(paywall.getByText("None", { exact: true }).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(paywall).toHaveCount(0);
  });
});
