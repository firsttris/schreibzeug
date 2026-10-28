import { expect, type Page, test } from "@playwright/test";
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

    const menu = await suggestionFor(page, "Das Angbot ", "Angebot");
    await menu.getByRole("menuitem", { name: "Angebot", exact: true }).click();
    await save(page);
    expect(await storedXml(page, fileId)).toContain("Das Angebot");

    await page.getByRole("menubar").getByRole("menuitem", { name: "Überprüfen", exact: true }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Rechtschreibprüfung" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("still checks once the browser has the spell checker cached", async ({ page }, testInfo) => {
    // The second document's checker loads its WebAssembly from the cache, ready before the page
    // tells it the languages; it must start all the same (engine/scripts/prepare.ts patchSpellWorker).
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await createDocument(page, "Erstes");
    await expectEditorReady(page, errors);
    await page.getByRole("button", { name: "Zurück" }).click();
    await createDocument(page, "Zweites");
    await expectEditorReady(page, errors);
    await expect(await suggestionFor(page, "Eine Rechnug ", "Rechnung")).toBeVisible();
    expect(errors.filter((line) => line.includes("Aborted"))).toEqual([]);
  });
});

/**
 * Types the text into a new document and right-clicks its second word: the context menu with the
 * suggestion. The word is checked in the background (the dictionary loads first), and the engine
 * reports it when the cursor moves into it, so each try comes from elsewhere in the line.
 */
const suggestionFor = async (page: Page, text: string, suggestion: string) => {
  const frame = page.getByTestId("engine-frame");
  await frame.click({ position: { x: 640, y: 210 } });
  await page.keyboard.type(text);
  const menu = page.getByRole("menu", { name: "Kontextmenü" });
  await expect(async () => {
    await page.keyboard.press("Escape");
    await frame.click({ position: { x: 640, y: FIRST_LINE_Y } });
    await frame.click({ position: { x: SECOND_WORD_X, y: FIRST_LINE_Y }, button: "right" });
    await expect(menu.getByRole("menuitem", { name: suggestion, exact: true })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 60_000 });
  return menu;
};

/** Where the second word of the first line of a new document is, in the frame. */
const SECOND_WORD_X = 255;
const FIRST_LINE_Y = 202;
