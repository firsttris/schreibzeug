import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  collectErrors,
  createFile,
  expectEditorReady,
  openDocument,
  openFileId,
  openOwnFolder,
  save,
  storedDocx,
  upload,
} from "./app";
import { partXml } from "./docx";

const preise = join(import.meta.dirname, "../test-files/preise.xlsx");

const frame = (page: Page) => page.frameLocator('[data-testid="engine-frame"]');

/** Selects a cell through the name box, as a person types a reference there. */
const goTo = async (page: Page, reference: string) => {
  const box = frame(page).locator("#name-box");
  await box.fill(reference);
  await box.press("Enter");
  await expect(box).toHaveValue(reference);
};

/** What the formula bar shows for the active cell: its formula or its value. */
const formulaBar = (page: Page) => frame(page).locator("#ce-cell-content");

const sheetXml = async (page: Page, fileId: string, sheet = 1) =>
  partXml(await storedDocx(page, fileId), `xl/worksheets/sheet${sheet}.xml`);

test("creates a spreadsheet, fills cells with a formula and stores them in the .xlsx", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await createFile(page, "Tabelle", "Haushalt");
  await expectEditorReady(page, errors);
  const fileId = openFileId(page);
  await expect(page.getByRole("tab", { name: "Tabelle1" })).toHaveAttribute("aria-selected", "true");

  await goTo(page, "A1");
  await page.keyboard.type("12");
  await page.keyboard.press("Enter");
  await page.keyboard.type("30");
  await page.keyboard.press("Enter");
  await page.keyboard.type("=SUM(A1:A2)");
  await page.keyboard.press("Enter");
  await goTo(page, "A3");
  await expect(formulaBar(page)).toHaveValue("=SUM(A1:A2)");
  await save(page);

  const xml = await sheetXml(page, fileId);
  expect(xml).toMatch(/<c r="A1"[^>]*><v>12<\/v>/);
  expect(xml).toMatch(/<c r="A3"[^>]*><f>SUM\(A1:A2\)<\/f><v>42<\/v>/);
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("opens an .xlsx with its sheets and formulas, formats a cell and keeps it", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, preise, "preise.xlsx");
  await openDocument(page, "preise.xlsx", errors);
  const fileId = openFileId(page);
  await expect(page.getByRole("tab")).toHaveText(["Preise", "Notizen"]);

  await goTo(page, "D5");
  await expect(formulaBar(page)).toHaveValue("=SUM(D2:D4)");
  await goTo(page, "A1");
  await page.getByRole("button", { name: "Fett" }).click();
  await expect(page.getByRole("button", { name: "Fett" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Zahlenformat" }).selectOption("currency");
  await save(page);

  const docx = await storedDocx(page, fileId);
  expect(partXml(docx, "xl/styles.xml")).toContain("<b/>");
  expect(partXml(docx, "xl/worksheets/sheet1.xml")).toMatch(
    /<c r="D5"[^>]*><f>SUM\(D2:D4\)<\/f><v>1514<\/v>/,
  );
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("adds, renames and deletes sheets", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await createFile(page, "Tabelle", "Blätter");
  await expectEditorReady(page, errors);
  const fileId = openFileId(page);

  await page.getByRole("button", { name: "Blatt hinzufügen" }).click();
  await expect(page.getByRole("tab")).toHaveText(["Tabelle1", "Tabelle2"]);
  await expect(page.getByRole("tab", { name: "Tabelle2" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Blatt bearbeiten" }).click();
  await page.getByRole("menuitem", { name: "Umbenennen" }).click();
  await page.getByLabel("Name des Blatts").fill("Ausgaben");
  await page.getByRole("button", { name: "Umbenennen", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveText(["Tabelle1", "Ausgaben"]);

  await page.getByRole("tab", { name: "Tabelle1" }).click();
  await page.getByRole("button", { name: "Blatt bearbeiten" }).click();
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  await expect(page.getByRole("tab")).toHaveText(["Ausgaben"]);
  await save(page);

  const workbook = partXml(await storedDocx(page, fileId), "xl/workbook.xml");
  expect(workbook).toContain('name="Ausgaben"');
  expect(workbook).not.toContain('name="Tabelle1"');
});
