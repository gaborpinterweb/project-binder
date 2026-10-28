import { expect, test } from "@playwright/test";
import {
  addManualTimelogOnOpenTask,
  addTaskNamed,
  closeTaskDialog,
  deleteFirstCardTimelog,
  editFirstCardTimelog,
  formatMinutesLabel,
  openFreshTasksBoard,
  openInTimelogsFromTask,
  openTaskCard,
  openTimelogsView,
  pomoBlock,
  startCountdownFromOpenTask,
  startStopwatchFromOpenTask,
  stopSidebarTimer,
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

  test('Open in Timelogs… from a task filters Timelogs to that card', async ({
    page,
  }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Filtered card");
    await openTaskCard(page, "Filtered card");
    await addManualTimelogOnOpenTask(page, {
      minutes: 20,
      note: "Only this card",
    });

    await openInTimelogsFromTask(page);

    await expect(page.locator(".log-filter")).toContainText("Filtered card");
    await expect(page.getByRole("button", { name: "Clear filter" })).toBeVisible();
    const row = timelogRow(page, "Filtered card");
    await expect(row).toBeVisible();
    await expect(row.locator(".timelog-note-text")).toHaveText("Only this card");
  });

  // Seed workspace ships with sample logs, so assert card-filtered empty instead.
  test("Timelogs should show empty state for a card with no logs", async ({
    page,
  }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "No logs yet");
    await openTaskCard(page, "No logs yet");

    await openInTimelogsFromTask(page);

    await expect(page.locator(".log-filter")).toContainText("No logs yet");
    await expect(page.locator(".empty-log")).toContainText(
      "No timelogs for this card."
    );
    await expect(page.locator(".timelog-row")).toHaveCount(0);
  });

  test("Timelogs totals should sum multiple entries on one task", async ({
    page,
  }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Multi log");
    await openTaskCard(page, "Multi log");
    await addManualTimelogOnOpenTask(page, { minutes: 20, note: "First" });
    await expect(taskDialog(page).locator(".dlg-timelog-dur")).toHaveText("20m");
    await addManualTimelogOnOpenTask(page, { minutes: 40, note: "Second" });

    const dlg = taskDialog(page);
    await expect(dlg.locator(".dlg-timelog-list .dlg-timelog-item")).toHaveCount(2);
    await expect(dlg.locator(".dlg-timelog-note", { hasText: "First" })).toBeVisible();
    await expect(dlg.locator(".dlg-timelog-note", { hasText: "Second" })).toBeVisible();
    await expect(dlg.locator(".dlg-timelog-total")).toHaveText(
      formatMinutesLabel(60)
    );

    // Filter to this card so seed timelogs don't inflate the view total.
    await openInTimelogsFromTask(page);
    await expect(page.locator(".log-filter")).toContainText("Multi log");
    await expect(timelogRow(page, "Multi log")).toHaveCount(2);
    await expect(page.locator(".log-view-head .log-agg")).toHaveText(
      formatMinutesLabel(60)
    );
  });

  test("starting a countdown should show the sidebar timer", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Countdown task");
    await openTaskCard(page, "Countdown task");

    await startCountdownFromOpenTask(page);

    const block = pomoBlock(page);
    await expect(block.locator("#pomo-card-title")).toHaveText("Countdown task");
    await expect(block.locator("#pomo-time")).toHaveText(/^2[0-5]:\d{2}$/);
    await expect(page.locator("#pomo-stop")).toHaveText("Cancel");
  });

  test("starting a stopwatch should show the sidebar timer", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Stopwatch task");
    await openTaskCard(page, "Stopwatch task");

    await startStopwatchFromOpenTask(page);

    const block = pomoBlock(page);
    await expect(block.locator("#pomo-card-title")).toHaveText("Stopwatch task");
    await expect(block.locator("#pomo-time")).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator("#pomo-stop")).toHaveText("Cancel");
  });

  test("stopping a timer under 1 minute should discard it", async ({ page }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Discard timer");
    await openTaskCard(page, "Discard timer");
    await startStopwatchFromOpenTask(page);
    await closeTaskDialog(page);

    await stopSidebarTimer(page);

    await expect(page.locator(".snackbar-msg")).toContainText(
      "Timers under 1 minute aren't saved"
    );

    await openTaskCard(page, "Discard timer");
    await expect(taskDialog(page).locator(".dlg-timelog-list")).toHaveCount(0);
  });

  test("stopping a timer after 1 minute should save a timelog", async ({
    page,
  }) => {
    await openFreshTasksBoard(page);
    await addTaskNamed(page, "Save timer");
    await openTaskCard(page, "Save timer");

    await page.clock.install();
    await startStopwatchFromOpenTask(page);
    await closeTaskDialog(page);

    await page.clock.fastForward(61_000);
    await expect(page.locator("#pomo-stop")).toHaveText("Stop and save");
    await stopSidebarTimer(page);

    await expect(page.locator(".snackbar-msg")).toContainText("Save timer");
    await expect(page.locator(".snackbar-msg")).toContainText("1m");

    await openTaskCard(page, "Save timer");
    const dlg = taskDialog(page);
    await expect(dlg.locator(".dlg-timelog-list .dlg-timelog-item")).toHaveCount(1);
    await expect(dlg.locator(".dlg-timelog-dur")).toHaveText("1m");
  });
});
