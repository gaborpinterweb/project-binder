import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { createVerifiedUser } from "./pbAdmin.js";

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

/** Fresh verified account, signed in, onboarding dismissed. */
export async function enterApp(page) {
  const email = uniqueEmail();
  const password = "password123";
  await createVerifiedUser(email, password);
  await signIn(page, email, password);
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(projectList(page).getByRole("button")).toHaveCount(DEMO_PROJECTS.length);
  return { email, password };
}

export function projectList(page) {
  return page.locator("#folders");
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
  await expect(projectList(page).getByRole("button")).toHaveCount(count);
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
  await page.getByRole("button", { name: "New project" }).click();
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

export async function openFreshTasksBoard(page, projectName = "Tasks Lab") {
  await enterApp(page);
  await createUserProject(page, projectName);
  await addTasksTab(page);
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
