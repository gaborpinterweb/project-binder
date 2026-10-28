import { expect, test } from "@playwright/test";
import {
  FIXTURES,
  addCardMeta,
  addTaskNamed,
  addTasksTab,
  addToCard,
  boardColumn,
  createUserProject,
  ensureTaskDescription,
  enterApp,
  closeTaskDialog,
  fillRichTaskDescription,
  openFreshTasksBoard,
  openMasterBoard,
  openTaskCard,
  startNewTaskInColumn,
  submitNewTask,
  taskDialog,
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

    await openTaskCard(page, "Open me");

    const title = taskDialog(page).locator("textarea.title");
    await expect(title).toBeVisible();
    await expect(title).toHaveValue("Open me");
  });

  test("should be able to add a task with rich description, effort and impact", async ({
    page,
  }) => {
    await openFreshTasksBoard(page);
    await startNewTaskInColumn(page);
    await page.getByPlaceholder("New task...").fill("Rich task");

    await fillRichTaskDescription(page);
    await addCardMeta(page, "effort", "High");
    await addCardMeta(page, "impact", "Medium");
    await submitNewTask(page);

    const card = page.locator(".card", { hasText: "Rich task" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Change effort" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Change impact" })).toBeVisible();

    await openTaskCard(page, "Rich task");
    const dlg = taskDialog(page);
    await expect(dlg.getByText("High effort", { exact: true })).toBeVisible();
    await expect(dlg.getByText("Medium impact", { exact: true })).toBeVisible();
    await expect(dlg.locator(".ProseMirror h1")).toContainText("Overview");
    await expect(dlg.locator(".ProseMirror ul").first()).toContainText("Bullet one");
    await expect(dlg.locator(".ProseMirror ol")).toContainText("Step one");
    await expect(dlg.locator('.ProseMirror ul[data-type="taskList"]')).toContainText(
      "Check me"
    );
  });

  test("should be able to add a task with an image in the description", async ({
    page,
  }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Image task");
    await openTaskCard(page, "Image task");
    await ensureTaskDescription(page);

    const dlg = taskDialog(page);
    // Caption required — image-only bodies count as empty and hide the editor.
    await dlg.locator(".ProseMirror").click();
    await page.keyboard.type("See screenshot");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      dlg.getByRole("button", { name: "Insert image" }).click(),
    ]);
    await chooser.setFiles(FIXTURES.image);
    await expect(dlg.locator(".ProseMirror img")).toBeVisible({ timeout: 15000 });
    await dlg.locator("textarea.title").click();

    await closeTaskDialog(page);
    await openTaskCard(page, "Image task");
    const open = taskDialog(page);
    await expect(open.locator(".ProseMirror")).toContainText("See screenshot");
    await expect(open.locator(".ProseMirror img")).toBeVisible({ timeout: 15000 });
  });

  test("should be able to add a task with two files", async ({ page }) => {
    await openFreshTasksBoard(page);
    await startNewTaskInColumn(page);
    await page.getByPlaceholder("New task...").fill("Files task");

    const dlg = taskDialog(page);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      addToCard(page, "File"),
    ]);
    await chooser.setFiles([FIXTURES.fileA, FIXTURES.fileB]);

    await expect(dlg.locator(".card-file-chip")).toHaveCount(2);
    await expect(dlg.getByTitle("brief-a.txt")).toBeVisible();
    await expect(dlg.getByTitle("brief-b.txt")).toBeVisible();

    await submitNewTask(page);
    await openTaskCard(page, "Files task");
    const open = taskDialog(page);
    await expect(open.locator(".card-file-chip")).toHaveCount(2);
    await expect(open.getByTitle("brief-a.txt")).toBeVisible();
    await expect(open.getByTitle("brief-b.txt")).toBeVisible();
  });

  test("should see tasks from both projects on Master board", async ({ page }) => {
    await openFreshTasksBoard(page, "Project A");
    await addTaskNamed(page, "Task from A");

    await createUserProject(page, "Project B", { clearDemos: false });
    await addTasksTab(page);
    await addTaskNamed(page, "Task from B");

    await openMasterBoard(page);
    await expect(page.locator(".card-name", { hasText: "Task from A" })).toBeVisible();
    await expect(page.locator(".card-name", { hasText: "Task from B" })).toBeVisible();
  });
});
