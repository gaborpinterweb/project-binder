import { expect, test } from "@playwright/test";
import {
  DEMO_PROJECTS,
  enterApp,
  leaveDemoProjects,
  openProjectCover,
  openProjectOptions,
  projectList,
} from "./helpers.js";

test.describe("Projects", () => {
  test("creating a project while 3 demo projects are in opens cleanup dialog", async ({
    page,
  }) => {
    await enterApp(page);
    await leaveDemoProjects(page, 3);

    await page.getByRole("button", { name: "New project" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", {
        name: "Creating your first project? Let's clean up first!",
      })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Delete and continue" })
    ).toBeVisible();
  });

  test("should be able to delete a project and see it in Trash", async ({ page }) => {
    await enterApp(page);
    const name = DEMO_PROJECTS[0];

    await openProjectCover(page, name);
    await openProjectOptions(page);
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete project" })
      .click();
    await expect(
      projectList(page).getByRole("button", { name, exact: true })
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Trash" }).click();
    const row = page.locator(".trash-row", { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.locator(".trash-col-type")).toHaveText("Project");
  });

  test("should be able to archive a project and see it in Archive", async ({
    page,
  }) => {
    await enterApp(page);
    const name = DEMO_PROJECTS[0];

    await openProjectCover(page, name);
    await openProjectOptions(page);
    await page.getByRole("menuitem", { name: "Archive project" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(
      projectList(page).getByRole("button", { name, exact: true })
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("tab", { name: "Archive" }).click();
    const row = settings.locator(".settings-row", { hasText: name });
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();
  });

  test("creating with 1 demo: cleanup, create project, cover, then second project", async ({
    page,
  }) => {
    await enterApp(page);
    await leaveDemoProjects(page, 1);
    const lastDemo = DEMO_PROJECTS[0];

    await page.getByRole("button", { name: "New project" }).click();
    const cleanup = page.getByRole("alertdialog");
    await expect(
      cleanup.getByRole("heading", {
        name: "Creating your first project? Let's clean up first!",
      })
    ).toBeVisible();
    await cleanup.getByRole("button", { name: "Delete and continue" }).click();

    await expect(page.getByPlaceholder("Project name...")).toBeVisible();
    await expect(
      projectList(page).getByRole("button", { name: lastDemo, exact: true })
    ).toHaveCount(0);
    await expect(projectList(page).getByRole("button")).toHaveCount(0);

    await page.getByPlaceholder("Project name...").fill("Alpha");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(
      projectList(page).getByRole("button", { name: "Alpha", exact: true })
    ).toBeVisible();

    await openProjectCover(page, "Alpha");
    await expect(page.locator(".cover-title-display")).toHaveText("Alpha");

    await page.getByRole("button", { name: "New project" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByPlaceholder("Project name...")).toBeVisible();
    await page.getByPlaceholder("Project name...").fill("Beta");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(
      projectList(page).getByRole("button", { name: "Beta", exact: true })
    ).toBeVisible();
    await openProjectCover(page, "Beta");
    await expect(page.locator(".cover-title-display")).toHaveText("Beta");
    await expect(
      projectList(page).getByRole("button", { name: "Alpha", exact: true })
    ).toBeVisible();
  });

  test("cover description updates when switching projects", async ({ page }) => {
    await enterApp(page);

    await openProjectCover(page, "Freelancing");
    const coverBody = page.locator(".cover-view .tiptap");
    await expect(coverBody).toContainText("non-billable backbone");
    await expect(page.locator(".cover-view .dlg-desc-label")).toHaveCount(0);

    await openProjectCover(page, "Client project A");
    await expect(page.locator(".cover-title-display")).toHaveText(
      "Client project A"
    );
    await expect(coverBody).toContainText("product demo, not a brochure");
    await expect(coverBody).not.toContainText("non-billable backbone");

    await openProjectCover(page, "Client project B");
    await expect(coverBody).toContainText("Launch window");
    await expect(coverBody).not.toContainText("product demo, not a brochure");
  });
});
