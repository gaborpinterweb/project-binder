import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import {
  createUserProject,
  enterApp,
  openProjectCover,
  openProjectOptions,
  projectList,
} from "./helpers.js";

test.describe("Export / import", () => {
  test("export zip restores a project after import", async ({ page }) => {
    await enterApp(page);
    const projectName = "Roundtrip Lab";
    await createUserProject(page, projectName);

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Data" }).click();

    const downloadPromise = page.waitForEvent("download");
    await settings.getByRole("button", { name: "Export" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);

    const zipPath = path.join(
      os.tmpdir(),
      `pb-e2e-backup-${Date.now()}.zip`
    );
    await download.saveAs(zipPath);

    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    expect(zip.file("userWorkspace.json")).toBeTruthy();
    expect(zip.file("userArchive.json")).toBeTruthy();
    const ws = JSON.parse(await zip.file("userWorkspace.json").async("string"));
    expect(Number(ws.version)).toBeGreaterThanOrEqual(2);
    expect(
      (ws.projects || []).some((p) => p?.name === projectName)
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    await openProjectCover(page, projectName);
    await openProjectOptions(page);
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete project" })
      .click();
    await expect(
      projectList(page).getByRole("button", { name: projectName, exact: true })
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Data" }).click();
    await settings.locator('input[type="file"][accept*="zip"]').setInputFiles(zipPath);

    const confirm = page.getByRole("alertdialog");
    await expect(
      confirm.getByRole("heading", { name: "Import workspace data?" })
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Import" }).click();

    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      projectList(page).getByRole("button", { name: projectName, exact: true })
    ).toBeVisible();

    fs.unlinkSync(zipPath);
  });
});
