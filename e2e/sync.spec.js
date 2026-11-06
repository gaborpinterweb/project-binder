import { expect, test } from "@playwright/test";
import { getUserDataChangeId } from "./pbAdmin.js";
import {
  addTaskNamed,
  addTasksTab,
  createUserProject,
  enterApp,
  enterAppAs,
  openProjectTasksTab,
  waitForChangeIdChange,
} from "./helpers.js";

function syncingDialog(page) {
  return page.locator(".ov-syncing");
}

/** Wait until changeId stops moving (debounced persists finished). */
async function waitForPersistIdle(email, { quietMs = 1200, timeout = 15_000 } = {}) {
  const start = Date.now();
  let last = await getUserDataChangeId(email);
  let quietSince = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 300));
    const now = await getUserDataChangeId(email);
    if (now !== last) {
      last = now;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) return last;
  }
  throw new Error("persist did not go idle");
}

test.describe("Workspace sync (changeId)", () => {
  test("stale persist remote wins", async ({ page, browser }) => {
    test.setTimeout(60_000);
    const { email, password } = await enterApp(page);
    const projectName = "Sync Lab";
    await createUserProject(page, projectName);
    await addTasksTab(page);

    const beforeBaseline = await getUserDataChangeId(email);
    await addTaskNamed(page, "Baseline");
    await waitForChangeIdChange(email, beforeBaseline);
    await waitForPersistIdle(email);

    // B loads the baseline revision, then stays on that tab without pulling.
    const other = await browser.newContext();
    try {
      const pageB = await other.newPage();
      await enterAppAs(pageB, email, password);
      await openProjectTasksTab(pageB, projectName);
      await expect(
        pageB.locator(".card-name", { hasText: "Baseline" })
      ).toBeVisible();
      await waitForPersistIdle(email);

      // Pause quiet pull before A advances remote, otherwise B may adopt
      // quietly and the later push will not be stale.
      const paused = await pageB.evaluate(() => {
        window.__pbSetBackgroundPullPaused?.(true);
        return window.__pbSyncDebug?.();
      });
      expect(paused?.backgroundPullPaused).toBe(true);
      const staleBase = paused.localBaseChangeId;

      // A advances remote while B is frozen on staleBase.
      await addTaskNamed(page, "From device A");
      await waitForChangeIdChange(email, staleBase);
      await waitForPersistIdle(email);

      const stillStale = await pageB.evaluate(() => window.__pbSyncDebug?.());
      expect(stillStale?.localBaseChangeId).toBe(staleBase);

      // Stale B pushes; conflict recovery adopts remote (A) and drops B's card.
      // Syncing overlay is not asserted: on local PB it can finish before paint.
      await pageB.locator('.col[data-col="Idea"] .col-body').dblclick();
      await pageB.getByPlaceholder("New task...").fill("From device B");
      await pageB.locator(".ov-top .dlg-create").click();

      await expect(
        pageB.locator(".card-name", { hasText: "From device A" })
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        pageB.locator(".card-name", { hasText: "From device B" })
      ).toHaveCount(0);

      const after = await pageB.evaluate(() => window.__pbSyncDebug?.());
      const remote = await getUserDataChangeId(email);
      expect(after?.localBaseChangeId).toBe(remote);
      expect(after?.localBaseChangeId).not.toBe(staleBase);

      await pageB.evaluate(() => window.__pbSetBackgroundPullPaused?.(false));
    } finally {
      await other.close();
    }
  });

  test("background pull adopts remote when local is clean", async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const { email, password } = await enterApp(page);
    const projectName = "Pull Lab";
    await createUserProject(page, projectName);
    await addTasksTab(page);

    const beforeBaseline = await getUserDataChangeId(email);
    await addTaskNamed(page, "Baseline");
    await waitForChangeIdChange(email, beforeBaseline);
    await waitForPersistIdle(email);

    const other = await browser.newContext();
    try {
      const pageB = await other.newPage();
      await enterAppAs(pageB, email, password);
      await openProjectTasksTab(pageB, projectName);
      await expect(
        pageB.locator(".card-name", { hasText: "Baseline" })
      ).toBeVisible();
      await waitForPersistIdle(email);

      const beforeA = await getUserDataChangeId(email);
      await addTaskNamed(page, "Pulled from A");
      await waitForChangeIdChange(email, beforeA);

      await pageB.evaluate(async () => {
        await window.__pbPullRemoteIfChanged?.();
      });

      await expect(
        pageB.locator(".card-name", { hasText: "Pulled from A" })
      ).toBeVisible({ timeout: 15_000 });
      await expect(syncingDialog(pageB)).toHaveCount(0);
    } finally {
      await other.close();
    }
  });
});
