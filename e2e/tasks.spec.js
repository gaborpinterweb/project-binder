import { expect, test } from "@playwright/test";
import {
  addTaskNamed,
  addTasksTab,
  boardColumn,
  createUserProject,
  enterApp,
  openFreshTasksBoard,
} from "./helpers.js";

test.describe("Tasks", () => {
  test("should be able to create a new tab with Tasks type", async ({ page }) => {
    await enterApp(page);
    await createUserProject(page, "Tasks Lab");

    await addTasksTab(page);

    await expect(page.locator("#tabs .tab", { hasText: "Tasks" })).toBeVisible();
    await expect(page.locator(".board")).toBeVisible();
  });

  test("new Tasks tab should have no tasks", async ({ page }) => {
    await openFreshTasksBoard(page);

    await expect(page.locator(".board .card")).toHaveCount(0);
    await expect(boardColumn(page, "Idea").locator(".col-count")).toHaveText("0");
    await expect(boardColumn(page, "Mandatory").locator(".col-count")).toHaveText("0");
  });

  test('default columns should be "Idea" and "Mandatory"', async ({ page }) => {
    await openFreshTasksBoard(page);

    await expect(boardColumn(page, "Idea")).toBeVisible();
    await expect(boardColumn(page, "Mandatory")).toBeVisible();
    await expect(page.locator(".board .col[data-col]")).toHaveCount(2);
  });

  test("should be able to add a new task", async ({ page }) => {
    await openFreshTasksBoard(page);

    await addTaskNamed(page, "Ship e2e coverage");

    await expect(boardColumn(page, "Idea").locator(".col-count")).toHaveText("1");
    await expect(
      boardColumn(page, "Idea").locator(".card-name", { hasText: "Ship e2e coverage" })
    ).toBeVisible();
  });

  test("clicking a created task should open the task dialog", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Open me");

    await page.locator(".card", { hasText: "Open me" }).click();

    const title = page.locator(".ov-top .dlg textarea.title");
    await expect(title).toBeVisible();
    await expect(title).toHaveValue("Open me");
  });
});
