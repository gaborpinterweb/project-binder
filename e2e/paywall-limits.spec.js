import { expect, test } from "@playwright/test";
import {
  FIXTURES,
  addTaskNamed,
  addTasksTab,
  createUserProject,
  enablePublicShare,
  enterApp,
  inflateWorkspaceAttachmentQuota,
  openProjectCover,
  openProjectOptions,
  openTaskCard,
  projectList,
  taskDialog,
  uploadFilesToOpenTask,
} from "./helpers.js";

function paywallDialog(page) {
  return page.getByRole("dialog", {
    name: /unlimited binder for all your freelancing business/i,
  });
}

async function openProjectTasksBoard(page, projectName) {
  await projectList(page)
    .getByRole("button", { name: projectName, exact: true })
    .click();
  await page.locator("#tabs .tab", { hasText: "Tasks" }).click();
  await expect(page.locator(".board")).toBeVisible();
}

test.describe("Paywall limits", () => {
  test.describe("Free", () => {
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

    test("upload near 200 MB storage opens the paywall", async ({ page }) => {
      test.setTimeout(90_000);
      const projectName = "Quota Free";
      const taskTitle = "Near cap";
      await enterApp(page);
      await createUserProject(page, projectName);
      await addTasksTab(page);
      await addTaskNamed(page, taskTitle);

      await inflateWorkspaceAttachmentQuota(page);
      await openProjectTasksBoard(page, projectName);
      await openTaskCard(page, taskTitle);
      await uploadFilesToOpenTask(page, FIXTURES.fileA);

      const paywall = paywallDialog(page);
      await expect(paywall).toBeVisible();
      await expect(paywall.getByText("200 MB", { exact: true })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(paywall).toHaveCount(0);
      await expect(taskDialog(page).getByTitle("brief-a.txt")).toHaveCount(0);
    });
  });

  test.describe("Pro", () => {
    test("public share does not open the paywall", async ({ page }) => {
      await enterApp(page, { pro: true });
      await createUserProject(page, "Share Allowed");
      await openProjectCover(page, "Share Allowed");
      await openProjectOptions(page);
      await page.getByRole("menuitem", { name: "Share" }).click();

      const { sharing } = await enablePublicShare(page, "Share Allowed");
      await expect(paywallDialog(page)).toHaveCount(0);
      await expect(
        sharing.getByRole("radio", { name: "Public read-only link" })
      ).toBeChecked();
      await expect(sharing.locator("a.sharing-link-anchor")).toBeVisible();
    });

    test("fourth active project does not open the paywall", async ({ page }) => {
      await enterApp(page, { pro: true });
      await createUserProject(page, "Pro One");
      await createUserProject(page, "Pro Two", { clearDemos: false });
      await createUserProject(page, "Pro Three", { clearDemos: false });
      await expect(projectList(page).getByRole("button")).toHaveCount(3);

      await page.getByRole("button", { name: "New project" }).click();
      await expect(page.getByPlaceholder("Project name...")).toBeVisible();
      await expect(paywallDialog(page)).toHaveCount(0);

      await page.getByPlaceholder("Project name...").fill("Pro Four");
      await page.getByRole("button", { name: "Create project" }).click();
      await expect(
        projectList(page).getByRole("button", { name: "Pro Four", exact: true })
      ).toBeVisible();
      await expect(projectList(page).getByRole("button")).toHaveCount(4);
    });

    test("upload near 200 MB storage does not open the paywall", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const projectName = "Quota Pro";
      const taskTitle = "Near cap";
      await enterApp(page, { pro: true });
      await createUserProject(page, projectName);
      await addTasksTab(page);
      await addTaskNamed(page, taskTitle);

      await inflateWorkspaceAttachmentQuota(page);
      await openProjectTasksBoard(page, projectName);
      await openTaskCard(page, taskTitle);
      await uploadFilesToOpenTask(page, FIXTURES.fileA);

      await expect(paywallDialog(page)).toHaveCount(0);
      await expect(taskDialog(page).getByTitle("brief-a.txt")).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});
