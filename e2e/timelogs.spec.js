import { expect, test } from "@playwright/test";
import {
  addManualTimelogOnOpenTask,
  addTaskNamed,
  closeTaskDialog,
  deleteFirstCardTimelog,
  editFirstCardTimelog,
  openFreshTasksBoard,
  openTaskCard,
  openTimelogsView,
  taskDialog,
  timelogRow,
} from "./helpers.js";

test.describe("Time tracking", () => {
  test("should be able to add a manual timelog from a task", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Loggable task");
    await openTaskCard(page, "Loggable task");

    await addManualTimelogOnOpenTask(page, {
      minutes: 45,
      note: "Deep work",
    });

    const dlg = taskDialog(page);
    await expect(dlg.locator(".dlg-desc-label", { hasText: "Timelogs" })).toBeVisible();
    await expect(dlg.locator(".dlg-timelog-list .dlg-timelog-item")).toHaveCount(1);
    await expect(dlg.locator(".dlg-timelog-dur")).toHaveText("45m");
    await expect(dlg.locator(".dlg-timelog-note")).toHaveText("Deep work");
  });

  test("manual timelog should appear in Timelogs view", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Visible in logs");
    await openTaskCard(page, "Visible in logs");
    await addManualTimelogOnOpenTask(page, {
      minutes: 30,
      note: "Ship it",
    });
    await closeTaskDialog(page);

    await openTimelogsView(page);

    const row = timelogRow(page, "Visible in logs");
    await expect(row).toBeVisible();
    await expect(row.locator(".dur")).toHaveText("30m");
    await expect(row.locator(".timelog-note-text")).toHaveText("Ship it");
  });

  test("should be able to edit a timelog", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Editable log");
    await openTaskCard(page, "Editable log");
    await addManualTimelogOnOpenTask(page, {
      minutes: 25,
      note: "Draft",
    });

    await editFirstCardTimelog(page, { minutes: 90, note: "Revised" });

    const dlg = taskDialog(page);
    await expect(dlg.locator(".dlg-timelog-list .dlg-timelog-item")).toHaveCount(1);
    await expect(dlg.locator(".dlg-timelog-dur")).toHaveText("1h 30m");
    await expect(dlg.locator(".dlg-timelog-note")).toHaveText("Revised");
  });

  test("should be able to delete a timelog", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Deletable log");
    await openTaskCard(page, "Deletable log");
    await addManualTimelogOnOpenTask(page, {
      minutes: 15,
      note: "Gone soon",
    });

    await deleteFirstCardTimelog(page);

    const dlg = taskDialog(page);
    await expect(dlg.locator(".dlg-timelog-list")).toHaveCount(0);
    await expect(dlg.getByRole("button", { name: "Add to card" })).toBeVisible();
  });
});
