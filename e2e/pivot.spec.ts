import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { collectErrors, openDocument, openFileId, openOwnFolder, save, storedDocx, upload } from "./app";
import { formulaBar, goTo } from "./sheet";

const umsatz = join(import.meta.dirname, "../test-files/umsatz.xlsx");

/** umsatz.xlsx open, a pivot table of its invoices made from "Einfügen" on a new sheet. */
const insertPivot = async (page: Page, testInfo: TestInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, umsatz, "umsatz.xlsx");
  await openDocument(page, "umsatz.xlsx", errors);
  await goTo(page, "B3");
  await page.getByRole("menubar").getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pivot-Tabelle …" }).click();
  const dialog = page.getByRole("dialog", { name: "Pivot-Tabelle einfügen" });
  await expect(dialog.getByLabel("Datenbereich mit Überschriften")).toHaveValue("Umsatz!$A$1:$D$7");
  await dialog.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("tab", { name: "Pivot1" })).toBeVisible();
  const panel = page.getByRole("complementary", { name: "Pivot-Tabelle" });
  await expect(panel).toBeVisible();
  return { fileId: openFileId(page), panel, errors };
};

const pivotParts = async (page: Page, fileId: string) => {
  const files = unzipSync(await storedDocx(page, fileId));
  const part = (pattern: RegExp) =>
    Object.entries(files)
      .filter(([name]) => pattern.test(name))
      .map(([, bytes]) => strFromU8(bytes))
      .join("");
  return { table: part(/^xl\/pivotTables\/pivotTable\d+\.xml$/), strings: part(/^xl\/sharedStrings\.xml$/) };
};

test("makes a pivot table of the invoices and arranges its fields", async ({ page }, testInfo) => {
  const { fileId, panel, errors } = await insertPivot(page, testInfo);
  const fields = panel.getByRole("region", { name: "Felder" });
  // Text goes to the rows, numbers to the values, as in Excel.
  await fields.getByRole("checkbox", { name: "Kunde" }).check();
  await fields.getByRole("checkbox", { name: "Betrag" }).check();
  await fields.getByRole("checkbox", { name: "Monat" }).check();
  await expect(panel.getByRole("region", { name: "Werte" })).toContainText("Summe von Betrag");
  await panel.getByLabel("Monat verschieben").selectOption("columns");
  await expect(panel.getByRole("region", { name: "Spalten" })).toContainText("Monat");
  await panel.getByLabel("Berechnung für Summe von Betrag").selectOption("count");
  await expect(panel.getByRole("region", { name: "Werte" })).toContainText("Anzahl von Betrag");
  await save(page);

  const { table, strings } = await pivotParts(page, fileId);
  expect(table).toMatch(/<rowFields count="1"><field x="1"\/><\/rowFields>/);
  expect(table).toMatch(/<colFields count="1"><field x="0"\/><\/colFields>/);
  expect(table).toMatch(/<dataField name="Anzahl von Betrag" fld="3" subtotal="count"/);
  expect(strings).toContain("Gesamtergebnis");
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);

  // Opened again, the table is still one: its fields show beside it.
  await page.reload();
  await expect(page.getByRole("tab", { name: "Pivot1" })).toBeVisible({ timeout: 30_000 });
  await goTo(page, "A5");
  await expect(page.getByRole("complementary", { name: "Pivot-Tabelle" })).toContainText("Anzahl von Betrag");
});

test("refreshes the pivot table after its data changed", async ({ page }, testInfo) => {
  const { fileId, panel } = await insertPivot(page, testInfo);
  const fields = panel.getByRole("region", { name: "Felder" });
  await fields.getByRole("checkbox", { name: "Kunde" }).check();
  await fields.getByRole("checkbox", { name: "Betrag" }).check();
  // Kunde in A4:A5 (Geißer, Roth), the sums beside them; the grand total below.
  await goTo(page, "B6");
  await expect(formulaBar(page)).toHaveValue("4150");

  await page.getByRole("tab", { name: "Umsatz" }).click();
  await goTo(page, "D2");
  await page.keyboard.type("1450");
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: "Pivot1" }).click();
  await goTo(page, "B6");
  await expect(formulaBar(page)).toHaveValue("4150");
  await page.getByRole("menubar").getByRole("button", { name: "Daten", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pivot-Tabelle aktualisieren" }).click();
  await goTo(page, "B6");
  await expect(formulaBar(page)).toHaveValue("5150");
  await save(page);
  expect((await pivotParts(page, fileId)).table).toContain("Summe von Betrag");
});
