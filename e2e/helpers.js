import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import JSZip from "jszip";
import { FREE_STORAGE_BYTES } from "../src/billingLimits.js";
import { createVerifiedUser, setUserPro } from "./pbAdmin.js";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = {
  image: path.join(E2E_DIR, "fixtures", "sample.png"),
  fileA: path.join(E2E_DIR, "fixtures", "brief-a.txt"),
  fileB: path.join(E2E_DIR, "fixtures", "brief-b.txt"),
};

/** Active (non-archived) demo projects from seedWorkspace.json. */
export const DEMO_PROJECTS = [
  "Freelancing",
  "Client project A",
  "Client project B",
];

export function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function signIn(page, email, password) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function dismissOnboarding(page) {
  const dialog = page.getByRole("dialog", { name: /Project Binder welcome/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Let's go" }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * Fresh verified account, signed in, onboarding dismissed.
 * @param {{ pro?: boolean }} [opts] — Commercial Pro entitlement (for share / limits).
 */
export async function enterApp(page, { pro = false } = {}) {
  const email = uniqueEmail();
  const password = "password123";
  await createVerifiedUser(email, password);
  if (pro) await setUserPro(email, true);
  await signIn(page, email, password);
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(projectButtons(page)).toHaveCount(DEMO_PROJECTS.length);
  return { email, password };
}

export async function openTabOptions(page) {
  await page
    .locator('button.tab-more-btn[aria-label="Tab options"]:not([disabled])')
    .click();
}

/** Enable “Public read-only link” in an open Sharing dialog; returns the public URL. */
export async function enablePublicShare(page, targetName) {
  const sharing = page.getByRole("dialog", {
    name: `Sharing for ${targetName}`,
  });
  await expect(sharing).toBeVisible();
  await sharing.getByRole("radio", { name: "Public read-only link" }).click();
  const link = sharing.locator("a.sharing-link-anchor");
  await expect(link).toBeVisible();
  const url = await link.getAttribute("href");
  expect(url).toMatch(/\/share\//);
  return { sharing, url };
}

export async function disablePublicShare(page, targetName) {
  const sharing = page.getByRole("dialog", {
    name: `Sharing for ${targetName}`,
  });
  await expect(sharing).toBeVisible();
  await sharing.getByRole("radio", { name: "No sharing" }).click();
  await expect(sharing.locator("a.sharing-link-anchor")).toHaveCount(0);
  await sharing.getByRole("button", { name: "Done" }).click();
  await expect(sharing).toHaveCount(0);
}

export function projectList(page) {
  return page.locator("#folders");
}

/** Project rows only (excludes empty-state "Add project"). */
export function projectButtons(page) {
  return projectList(page).locator("button.bm");
}

/** Header "+" or empty-state CTA — both use #add-project. */
export async function clickNewProject(page) {
  await page.locator("#add-project").click();
}

export async function openProjectCover(page, name) {
  await projectList(page).getByRole("button", { name, exact: true }).dblclick();
  await expect(page.locator(".cover-view")).toBeVisible();
  await expect(page.locator(".cover-title-display")).toHaveText(name);
}

export async function openProjectOptions(page) {
  await page
    .locator('button.tab-more-btn[aria-label="Project options"]:not([disabled])')
    .click();
}

/** Delete named projects via Cover → Project options (moves to Trash). */
export async function deleteProjectsByName(page, names) {
  for (const name of names) {
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
  }
}

/** Keep the first `count` active seed demos; delete the rest. */
export async function leaveDemoProjects(page, count) {
  if (count < 0 || count > DEMO_PROJECTS.length) {
    throw new Error(`leaveDemoProjects: count must be 0..${DEMO_PROJECTS.length}`);
  }
  const keep = DEMO_PROJECTS.slice(0, count);
  const remove = DEMO_PROJECTS.slice(count);
  await deleteProjectsByName(page, remove);
  for (const name of keep) {
    await expect(
      projectList(page).getByRole("button", { name, exact: true })
    ).toBeVisible();
  }
  await expect(projectButtons(page)).toHaveCount(count);
}

/**
 * Create a user project. By default clears seed demos first (empty binder).
 * Pass `{ clearDemos: false }` when adding another project in the same session.
 */
export async function createUserProject(
  page,
  name = "Tasks Lab",
  { clearDemos = true } = {}
) {
  if (clearDemos) await leaveDemoProjects(page, 0);
  await clickNewProject(page);
  await expect(page.getByPlaceholder("Project name...")).toBeVisible();
  await page.getByPlaceholder("Project name...").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(
    projectList(page).getByRole("button", { name, exact: true })
  ).toBeVisible();
}

export async function openMasterBoard(page) {
  await page.getByRole("button", { name: "Master board" }).click();
  await expect(page.locator(".board")).toBeVisible();
}

export function taskCard(page, title) {
  return page.locator(".card", { hasText: title });
}

/** Complete via the card checkbox (default view hides completed cards). */
export async function completeTaskCard(page, title) {
  const card = taskCard(page, title);
  await expect(card).toBeVisible();
  // click(), not check() — hide-completed unmounts the card before Playwright
  // can assert the input's checked state.
  await card.locator(".card-check").click();
  await expect(taskCard(page, title)).toHaveCount(0);
}

/** Delete via card context menu → confirm. */
export async function deleteTaskCard(page, title) {
  const card = taskCard(page, title);
  await expect(card).toBeVisible();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete task" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator(".card-name", { hasText: title })).toHaveCount(0);
}

/** Add a Tasks (Board) tab on the current project and wait for the board. */
export async function addTasksTab(page) {
  await page.locator("#add").click();
  await page.locator("#menu").getByRole("button", { name: /Tasks/ }).click();
  await expect(page.locator("#tabs .tab", { hasText: "Tasks" })).toBeVisible();
  await expect(page.locator(".board")).toBeVisible();
}

/** Add a Notes tab on the current project. */
export async function addNotesTab(page) {
  await page.locator("#add").click();
  await page.locator("#menu").getByRole("button", { name: /Notes/ }).click();
  await expect(page.locator("#tabs .tab", { hasText: "Notes" })).toBeVisible();
  await expect(page.locator(".notes-view")).toBeVisible();
}

export async function openFreshTasksBoard(page, projectName = "Tasks Lab") {
  await enterApp(page);
  await createUserProject(page, projectName);
  await addTasksTab(page);
}

export async function openFreshNotesTab(page, projectName = "Notes Lab") {
  await enterApp(page);
  await createUserProject(page, projectName);
  await addNotesTab(page);
}

/** Assert an <img> is visible and has decoded pixels (not a broken pb-blob://). */
export async function expectImgLoaded(locator, timeout = 15000) {
  await expect(locator).toBeVisible({ timeout });
  await expect
    .poll(async () => locator.evaluate((img) => img.naturalWidth || 0), {
      timeout,
    })
    .toBeGreaterThan(0);
}

/** Create a note and wait for the unlocked editor. */
export async function addNote(page) {
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".notes-main .ProseMirror")).toBeVisible();
}

export async function lockSelectedNote(page) {
  await page.locator(".modbar").getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.locator(".notes-preview")).toBeVisible();
}

export async function unlockSelectedNote(page) {
  await page.locator(".modbar").getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".notes-main .ProseMirror")).toBeVisible();
}

export function boardColumn(page, name) {
  return page.locator(`.col[data-col="${name}"]`);
}

/** Double-click empty column body to open the new-task dialog. */
export async function startNewTaskInColumn(page, columnName = "Idea") {
  await boardColumn(page, columnName).locator(".col-body").dblclick();
  await expect(page.getByPlaceholder("New task...")).toBeVisible();
}

export async function addTaskNamed(page, title, columnName = "Idea") {
  await startNewTaskInColumn(page, columnName);
  await page.getByPlaceholder("New task...").fill(title);
  await page.locator(".ov-top .dlg-create").click();
  await expect(page.locator(".card-name", { hasText: title })).toBeVisible();
}

export function taskDialog(page) {
  return page.locator(".ov-top .dlg").first();
}

export async function openTaskCard(page, title) {
  await page.locator(".card", { hasText: title }).click();
  await expect(taskDialog(page).locator("textarea.title")).toBeVisible();
}

/** Open the + Add to card menu and pick a top-level item (Description / File). */
export async function addToCard(page, menuItemName) {
  const dlg = taskDialog(page);
  await dlg.getByRole("button", { name: "Add to card" }).click();
  await dlg.getByRole("menuitem", { name: menuItemName, exact: true }).click();
}

/** Pick Effort or Impact level from the Add-to-card submenu. */
export async function addCardMeta(page, kind, level) {
  const label = kind === "effort" ? "Effort" : "Impact";
  const dlg = taskDialog(page);
  await dlg.getByRole("button", { name: "Add to card" }).click();
  const sub = dlg.locator(".card-add-sub").filter({
    has: page.getByRole("menuitem", { name: label, exact: true }),
  });
  await sub.getByRole("menuitem", { name: label, exact: true }).hover();
  await expect(sub.locator(".card-add-sub-menu")).toBeVisible();
  await sub.locator(".card-add-sub-menu").getByRole("menuitem", { name: level, exact: true }).click();
  const chip = kind === "effort" ? `${level} effort` : `${level} impact`;
  await expect(dlg.getByText(chip, { exact: true })).toBeVisible();
}

export async function ensureTaskDescription(page) {
  const dlg = taskDialog(page);
  if (await dlg.locator(".ProseMirror").count()) return;
  await addToCard(page, "Description");
  await expect(dlg.locator(".ProseMirror")).toBeVisible();
}

/** Type rich blocks into the open task description editor. */
export async function fillRichTaskDescription(page) {
  const dlg = taskDialog(page);
  await ensureTaskDescription(page);
  const editor = dlg.locator(".ProseMirror");

  await editor.click();
  await dlg.getByRole("button", { name: "Heading 1" }).click();
  await page.keyboard.type("Overview");
  await expect(editor.locator("h1")).toContainText("Overview");
  await page.keyboard.press("Enter");

  await dlg.getByRole("button", { name: "List", exact: true }).click();
  await page.keyboard.type("Bullet one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bullet two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(editor.locator("ul").first()).toContainText("Bullet one");

  await dlg.getByRole("button", { name: "Numbered list" }).click();
  await page.keyboard.type("Step one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Step two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(editor.locator("ol")).toContainText("Step one");

  await dlg.getByRole("button", { name: "Checklist" }).click();
  await page.keyboard.type("Check me");
  await expect(editor.locator('ul[data-type="taskList"]')).toContainText("Check me");

  // Blur editor so the last TipTap onUpdate is committed before create/persist.
  await dlg.locator("textarea.title").click();
}

export async function submitNewTask(page) {
  await page.locator(".ov-top .dlg-create").click();
  await expect(page.locator(".ov-top .dlg")).toHaveCount(0);
}

/** Close an existing (non-draft) task dialog and wait for it to persist away. */
export async function closeTaskDialog(page) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".ov-top .dlg")).toHaveCount(0);
}

export function addTimelogDialog(page) {
  return page.getByRole("dialog", { name: "Add timelog" });
}

export function editTimelogDialog(page) {
  return page.getByRole("dialog", { name: "Edit timelog" });
}

/** Open Add to card → Timelogs submenu (task dialog open, no logs yet). */
export async function openTaskTimelogsSubmenu(page) {
  const dlg = taskDialog(page);
  await dlg.getByRole("button", { name: "Add to card" }).click();
  const sub = dlg.locator(".card-add-sub").filter({
    has: page.getByRole("menuitem", { name: "Timelogs", exact: true }),
  });
  await sub.getByRole("menuitem", { name: "Timelogs", exact: true }).hover();
  await expect(sub.locator(".card-add-sub-menu")).toBeVisible();
  return sub.locator(".card-add-sub-menu");
}

/** Open Add to card → Timelogs → Add timelog manually (task dialog open). */
export async function openAddManualTimelogFromTask(page) {
  const menu = await openTaskTimelogsSubmenu(page);
  await menu.getByRole("menuitem", { name: "Add timelog manually" }).click();
  await expect(addTimelogDialog(page)).toBeVisible();
}

/** Open Timelog actions ⋮ on the card Timelogs section (logs already present). */
export async function openCardTimelogActions(page) {
  const dlg = taskDialog(page);
  await dlg.getByRole("button", { name: "Timelog actions" }).click();
  // TimelogDropdown uses Dropdown → role="option" (not menuitem).
  await expect(
    page.getByRole("option", { name: "Add timelog manually" })
  ).toBeVisible();
}

export async function submitTimelogDialog(page, { minutes, note } = {}) {
  const dlg = page.getByRole("dialog", { name: /^(Add|Edit) timelog$/ });
  if (note != null) await dlg.getByLabel("Note").fill(note);
  if (minutes != null) {
    const mins = dlg.getByLabel("Minutes");
    // Wait for the controlled default to settle (Strict Mode remount), then set.
    await expect(mins).toHaveValue(/.+/);
    await mins.fill(String(minutes));
    await expect(mins).toHaveValue(String(minutes));
  }
  const submit = dlg.getByRole("button", { name: /^(Add|Save)$/ });
  await submit.click();
  await expect(dlg).toHaveCount(0);
}

/** Format like utils.formatDuration for minutes under 24h. */
export function formatMinutesLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Add a manual timelog on the open task; returns after the card list reloads. */
export async function addManualTimelogOnOpenTask(
  page,
  { minutes = 45, note = "E2E log" } = {}
) {
  const dlg = taskDialog(page);
  const before = await dlg.locator(".dlg-timelog-list .dlg-timelog-item").count();
  if (before === 0) {
    await openAddManualTimelogFromTask(page);
  } else {
    await openCardTimelogActions(page);
    await page.getByRole("option", { name: "Add timelog manually" }).click();
    await expect(addTimelogDialog(page)).toBeVisible();
  }
  await submitTimelogDialog(page, { minutes, note });
  await expect(dlg.locator(".dlg-timelog-list .dlg-timelog-item")).toHaveCount(
    before + 1
  );
  if (note) {
    await expect(
      dlg.locator(".dlg-timelog-note", { hasText: note })
    ).toBeVisible();
  }
}

/** Jump to Timelogs filtered to the open task (Open in Timelogs…). */
export async function openInTimelogsFromTask(page) {
  const dlg = taskDialog(page);
  const hasSection = (await dlg.locator(".dlg-timelogs").count()) > 0;
  if (hasSection) {
    await openCardTimelogActions(page);
    await page.getByRole("option", { name: "Open in Timelogs..." }).click();
  } else {
    const menu = await openTaskTimelogsSubmenu(page);
    await menu.getByRole("menuitem", { name: "Open in Timelogs..." }).click();
  }
  await expect(page.locator(".ov-top .dlg")).toHaveCount(0);
  await expect(page.locator(".log.timelogs")).toBeVisible();
  await expect(page.locator(".log-filter")).toBeVisible();
}

export async function openTimelogsView(page) {
  await page.locator("#globals").getByRole("button", { name: "Timelogs" }).click();
  await expect(page.locator(".log.timelogs")).toBeVisible();
}

export function timelogRow(page, taskTitle) {
  return page.locator(".timelog-row", {
    has: page.locator(".card-name", { hasText: taskTitle }),
  });
}

/** Edit the first card-dialog timelog via ⋮ → Edit. */
export async function editFirstCardTimelog(page, { minutes, note } = {}) {
  const dlg = taskDialog(page);
  const item = dlg.locator(".dlg-timelog-list .dlg-timelog-item").first();
  await item.getByRole("button", { name: "Timelog options" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(editTimelogDialog(page)).toBeVisible();
  await submitTimelogDialog(page, { minutes, note });
}

/** Delete the first card-dialog timelog via ⋮ → Delete → confirm. */
export async function deleteFirstCardTimelog(page) {
  const dlg = taskDialog(page);
  const item = dlg.locator(".dlg-timelog-list .dlg-timelog-item").first();
  await item.getByRole("button", { name: "Timelog options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(dlg.locator(".dlg-timelog-list")).toHaveCount(0);
}

export function pomoBlock(page) {
  return page.locator("#pomo-block");
}

/** Start countdown from Add to card → Timelogs (task dialog open). */
export async function startCountdownFromOpenTask(page) {
  const menu = await openTaskTimelogsSubmenu(page);
  await menu.getByRole("menuitem", { name: /Start \d+m countdown/ }).click();
  await expect(pomoBlock(page)).toBeVisible();
}

/** Start stopwatch from Add to card → Timelogs (task dialog open). */
export async function startStopwatchFromOpenTask(page) {
  const menu = await openTaskTimelogsSubmenu(page);
  await menu.getByRole("menuitem", { name: "Start stopwatch" }).click();
  await expect(pomoBlock(page)).toBeVisible();
}

export async function stopSidebarTimer(page) {
  await page.locator("#pomo-stop").click();
  await expect(pomoBlock(page)).toHaveCount(0);
}

/**
 * Export workspace, attach synthetic card-file meta with a large `size`, import back.
 * Quota math uses metadata sizes; no real multi-MB blob is written.
 * Call with at least one board card already present.
 */
export async function inflateWorkspaceAttachmentQuota(
  page,
  // Leave ~1 KiB under Free cap so a tiny real upload tips Free over; JSON meta also counts.
  bytes = FREE_STORAGE_BYTES - 1024
) {
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "Data" }).click();

  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
  await settings.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  const zipPath = path.join(os.tmpdir(), `pb-e2e-quota-${Date.now()}.zip`);
  await download.saveAs(zipPath);

  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  fs.unlinkSync(zipPath);
  const wsName = "userWorkspace.json";
  const wsText = await zip.file(wsName)?.async("string");
  if (!wsText) throw new Error("inflateWorkspaceAttachmentQuota: missing workspace");
  const ws = JSON.parse(wsText);

  let patched = false;
  for (const project of ws.projects || []) {
    for (const board of project.boards || []) {
      const card = (board.cards || [])[0];
      if (!card) continue;
      card.files = [
        {
          id: "quotaPad0001",
          name: "quota-pad.bin",
          mime: "application/octet-stream",
          size: bytes,
          createdAt: new Date().toISOString(),
        },
      ];
      patched = true;
      break;
    }
    if (patched) break;
  }
  if (!patched) {
    throw new Error(
      "inflateWorkspaceAttachmentQuota: no board card found to attach quota pad"
    );
  }

  zip.file(wsName, `${JSON.stringify(ws, null, 2)}\n`);
  const out = await zip.generateAsync({ type: "nodebuffer" });

  // Match export-import: close Settings then reopen before choosing the zip.
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "Data" }).click();

  await settings.locator('input[type="file"][accept*="zip"]').setInputFiles({
    name: "project-binder-backup.zip",
    mimeType: "application/zip",
    buffer: out,
  });
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("heading", { name: "Import workspace data?" })
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Import" }).click();

  // Import reloads; URL may restore Settings — wait for app shell then dismiss.
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible({
    timeout: 30_000,
  });
  if (await settings.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  await expect(settings).toHaveCount(0);
  await expect(page.locator("#folders")).toBeVisible();
}

/** Open card → Add File via file chooser; returns after chooser is set. */
export async function uploadFilesToOpenTask(page, filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    addToCard(page, "File"),
  ]);
  await chooser.setFiles(paths);
}
