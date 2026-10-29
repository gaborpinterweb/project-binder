import { expect, test } from "@playwright/test";
import {
  FIXTURES,
  addNote,
  expectImgLoaded,
  lockSelectedNote,
  openFreshNotesTab,
  unlockSelectedNote,
} from "./helpers.js";

test.describe("Notes", () => {
  test("note image stays visible after lock and unlock", async ({ page }) => {
    await openFreshNotesTab(page);
    await addNote(page);

    const editor = page.locator(".notes-main .ProseMirror");
    await editor.click();
    await page.keyboard.type("Photo note");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Insert image" }).click(),
    ]);
    await chooser.setFiles(FIXTURES.image);
    await expectImgLoaded(editor.locator("img"));

    await lockSelectedNote(page);
    await expectImgLoaded(page.locator(".notes-preview img"));

    await unlockSelectedNote(page);
    await expectImgLoaded(page.locator(".notes-main .ProseMirror img"));
  });
});
