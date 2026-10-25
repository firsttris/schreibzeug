import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  collectErrors,
  expectEditorReady,
  openDocument,
  openFileId,
  openOwnFolder,
  row,
  save,
  storedDocx,
  upload,
} from "./app";
import { formulaBar, goTo } from "./sheet";

const testFile = (name: string) => join(import.meta.dirname, "../test-files", name);

/** The text of an XML part, without its markup: what a reader of the file would see. */
const textOf = (bytes: Uint8Array, part: string) => {
  const xml = strFromU8(unzipSync(bytes)[part] ?? new Uint8Array());
  return xml
    .replace(/<text:s\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&");
};

/** An OpenDocument file says what it is in its first part, "mimetype" (ODF 1.2 Part 3, 3.3). */
const mimetypeOf = (bytes: Uint8Array) => strFromU8(unzipSync(bytes).mimetype ?? new Uint8Array());

const openUploaded = async (page: Page, testInfo: TestInfo, name: string) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, testFile(name), name);
  await openDocument(page, name, errors);
  return { errors, fileId: openFileId(page) };
};

test.describe("OpenDocument files, edited and saved as what they are", () => {
  test("edits an .odt and saves it as .odt", async ({ page }, testInfo) => {
    const { errors, fileId } = await openUploaded(page, testInfo, "angebot.odt");
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 260 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Neu: ");
    await save(page);

    const stored = await storedDocx(page, fileId);
    expect(mimetypeOf(stored)).toBe("application/vnd.oasis.opendocument.text");
    const text = textOf(stored, "content.xml");
    expect(text).toContain("Neu: Angebot Lagerverwaltung");
    expect(text).toContain("Bestandsübersicht");
    expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
  });

  test("edits an .ods and saves it as .ods", async ({ page }, testInfo) => {
    const { fileId } = await openUploaded(page, testInfo, "preise.ods");
    await goTo(page, "A2");
    await expect(formulaBar(page)).toHaveValue("Barcode-Scanner");
    await goTo(page, "A7");
    await page.keyboard.type("Lieferung");
    await page.keyboard.press("Enter");
    await save(page);

    const stored = await storedDocx(page, fileId);
    expect(mimetypeOf(stored)).toBe("application/vnd.oasis.opendocument.spreadsheet");
    expect(textOf(stored, "content.xml")).toContain("Lieferung");
    expect(textOf(stored, "content.xml")).toContain("Etikettendrucker");
  });

  test("opens an .odp with its slides and saves it as .odp", async ({ page }, testInfo) => {
    const { fileId } = await openUploaded(page, testInfo, "vortrag.odp");
    await save(page);
    const stored = await storedDocx(page, fileId);
    expect(mimetypeOf(stored)).toBe("application/vnd.oasis.opendocument.presentation");
    const text = textOf(stored, "content.xml");
    expect(text).toContain("Lagerverwaltung");
    expect(text).toContain("Barcode am Regal");
  });
});

test.describe("older formats, opened as a copy in the Office format", () => {
  for (const [name, copy, part, expected] of [
    ["angebot.doc", "angebot.docx", "word/document.xml", "Angebot Lagerverwaltung"],
    ["angebot.rtf", "angebot.docx", "word/document.xml", "Angebot Lagerverwaltung"],
    ["preise.xls", "preise.xlsx", "xl/sharedStrings.xml", "Barcode-Scanner"],
    ["vortrag.ppt", "vortrag.pptx", "ppt/slides/slide1.xml", "Lagerverwaltung"],
  ] as const) {
    test(`makes ${copy} of ${name} beside it and opens that`, async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      await openOwnFolder(page, testInfo);
      await upload(page, testFile(name), name);
      await page.getByRole("link", { name, exact: true }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
      await expect(page.getByText(/Diese Datei ist im älteren Format/)).toBeVisible();
      await page.getByRole("button", { name: `Als .${copy.split(".")[1]} öffnen` }).click();
      await expectEditorReady(page, errors);
      const fileId = openFileId(page);
      const stored = await storedDocx(page, fileId);
      expect(textOf(stored, part)).toContain(expected);

      // Back in the folder: the copy beside the file, which is still there.
      await page.goBack();
      await page.goBack();
      await expect(row(page, copy)).toBeVisible();
      await expect(row(page, name)).toBeVisible();
    });
  }
});
