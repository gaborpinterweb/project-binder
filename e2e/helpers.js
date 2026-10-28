import { expect } from "@playwright/test";
import { createVerifiedUser } from "./pbAdmin.js";

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
