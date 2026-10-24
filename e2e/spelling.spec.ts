import { expect, test } from "@playwright/test";
import {
  collectErrors,
  createDocument,
  expectEditorReady,
  openFileId,
  openOwnFolder,
  save,
  storedXml,
} from "./app";

test.describe("spell checking", () => {
  test("suggests the right word for a misspelled one and puts it in", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await createDocument(page, "Rechtschreibung");
    await expectEditorReady(page, errors);
    const fileId = openFileId(page);

    const frame = page.getByTestId("engine-frame");
    await frame.click({ position: { x: 640, y: 210 } });
    await page.keyboard.type("Das Angbot ");

    // A right click into the misspelled word: its suggestions come first. The word is checked in
    // the background (the dictionary loads first), and the engine reports it when the cursor moves
    // into it, so each try comes from elsewhere in the line.
    const menu = page.getByRole("menu", { name: "Kontextmenü" });
    await expect(async () => {
      await page.keyboard.press("Escape");
      await frame.click({ position: { x: 640, y: FIRST_LINE_Y } });
      await frame.click({ position: { x: SECOND_WORD_X, y: FIRST_LINE_Y }, button: "right" });
      await expect(menu.getByRole("menuitem", { name: "Angebot", exact: true })).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout: 60_000 });
    await menu.getByRole("menuitem", { name: "Angebot", exact: true }).click();
    await save(page);
    expect(await storedXml(page, fileId)).toContain("Das Angebot");

    await page.getByRole("menubar").getByRole("button", { name: "Überprüfen" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Rechtschreibprüfung" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

/** Where the second word of the first line of a new document is, in the frame. */
const SECOND_WORD_X = 255;
const FIRST_LINE_Y = 202;
