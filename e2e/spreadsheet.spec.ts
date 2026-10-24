import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  collectErrors,
  createFile,
  expectEditorReady,
  insertImageFromMenu,
  openDocument,
  openFileId,
  openOwnFolder,
  save,
  storedDocx,
  storedMedia,
  upload,
} from "./app";
import { partXml } from "./docx";
import { solidPng } from "./png";

const preise = join(import.meta.dirname, "../test-files/preise.xlsx");

/** Where the filter button of A1 in preise.xlsx is, in the frame (widths set in test-files/make.ts). */
const FILTER_BUTTON_X = 170;
const FILTER_BUTTON_Y = 62;

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

test.describe("menus of the spreadsheet", () => {
  /** Opens a menu of the menu bar and picks an entry. */
  const pick = async (page: Page, menu: string, entry: string) => {
    await page.getByRole("menubar").getByRole("button", { name: menu, exact: true }).click();
    const list = page.getByRole("menu", { name: menu });
    await list
      .getByRole("menuitem", { name: entry })
      .or(list.getByRole("menuitemcheckbox", { name: entry }))
      .first()
      .click();
  };

  const openPreise = async (page: Page, testInfo: TestInfo) => {
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await upload(page, preise, "preise.xlsx");
    await openDocument(page, "preise.xlsx", errors);
    return openFileId(page);
  };

  test("formats the selected cell from the format menu", async ({ page }, testInfo) => {
    const fileId = await openPreise(page, testInfo);
    await goTo(page, "B2");
    await pick(page, "Format", "Kursiv");
    await expect(page.getByRole("button", { name: "Kursiv", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pick(page, "Ansicht", "150 %");
    await page.getByRole("menubar").getByRole("button", { name: "Ansicht" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "150 %" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");
    await save(page);
    expect(await partXml(await storedDocx(page, fileId), "xl/styles.xml")).toContain("<i/>");
  });

  test("finds and replaces in the sheet", async ({ page }, testInfo) => {
    const fileId = await openPreise(page, testInfo);
    await page.getByRole("menubar").getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("menuitem", { name: "Suchen und ersetzen" }).click();
    const bar = page.getByRole("search", { name: "Suchen und ersetzen" });
    await bar.getByLabel("Suchen", { exact: true }).fill("drucker");
    await expect(bar.getByTestId("search-result")).toHaveText(/von/);
    await bar.getByLabel("Ersetzen durch").fill("printer");
    await bar.getByRole("button", { name: "Alle ersetzen" }).click();
    await expect(bar.getByTestId("search-result")).toHaveText("1 ersetzt");
    await save(page);
    expect(await partXml(await storedDocx(page, fileId), "xl/sharedStrings.xml")).toContain(
      "Etikettenprinter",
    );
  });

  test("opens its own menu on a right click in the grid", async ({ page }, testInfo) => {
    await openPreise(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 300, y: 200 }, button: "right" });
    const menu = page.getByRole("menu", { name: "Kontextmenü" });
    await expect(menu.getByRole("menuitem", { name: "Zeile einfügen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("sorts the rows, freezes the first row and keeps both", async ({ page }, testInfo) => {
    const fileId = await openPreise(page, testInfo);
    // One column of a table: its rows come along (the whole region, the total too), as Excel's
    // question would by default.
    await goTo(page, "A2:A4");
    await pick(page, "Daten", "Absteigend sortieren (Z–A)");
    await goTo(page, "A2");
    await expect(formulaBar(page)).toHaveValue("Regaletiketten");
    await goTo(page, "B2");
    await expect(formulaBar(page)).toHaveValue("500");

    await pick(page, "Ansicht", "Oberste Zeile fixieren");
    await page.getByRole("menubar").getByRole("button", { name: "Ansicht" }).click();
    await expect(page.getByRole("menuitem", { name: "Fixierung aufheben" })).toBeVisible();
    await page.keyboard.press("Escape");
    await save(page);

    const xml = await sheetXml(page, fileId);
    expect(xml).toMatch(/<c r="A2"[^>]*t="s"/);
    expect(xml).toMatch(/<pane [^>]*ySplit="1"[^>]*state="frozen"/);
    const strings = partXml(await storedDocx(page, fileId), "xl/sharedStrings.xml");
    const order = ["Regaletiketten", "Etikettendrucker", "Barcode-Scanner"].map((text) =>
      strings.indexOf(text),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  test("filters a column by its values and keeps the filter", async ({ page }, testInfo) => {
    const fileId = await openPreise(page, testInfo);
    await goTo(page, "A1");
    const filter = page.getByRole("button", { name: "Filter", exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");

    // The button sits at the right edge of the header cell A1.
    await page.getByTestId("engine-frame").click({ position: { x: FILTER_BUTTON_X, y: FILTER_BUTTON_Y } });
    const dialog = page.getByRole("dialog", { name: "Filter" });
    await expect(dialog.getByRole("checkbox", { name: "Barcode-Scanner" })).toBeChecked();
    await dialog.getByRole("checkbox", { name: "Barcode-Scanner" }).uncheck();
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("menubar").getByRole("button", { name: "Daten" }).click();
    await expect(page.getByRole("menuitem", { name: "Filter löschen" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await save(page);

    const xml = await sheetXml(page, fileId);
    expect(xml).toMatch(/<autoFilter ref="A1:D5"/);
    expect(xml).toMatch(/<row r="2"[^>]*hidden="1"/);
    expect(xml).toMatch(/<filterColumn colId="0"/);
  });

  test("makes a chart of the selection, changes its kind and keeps it in the .xlsx", async ({
    page,
  }, testInfo) => {
    const fileId = await openPreise(page, testInfo);
    await goTo(page, "A1:B4");
    await pick(page, "Einfügen", "Diagramm: Säulen");
    // The new chart is selected: the menu now shows its kind and changes it.
    await page.getByRole("menubar").getByRole("button", { name: "Einfügen" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Diagramm: Säulen" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("menuitemcheckbox", { name: "Diagramm: Linien" }).click();
    await save(page);

    const files = unzipSync(await storedDocx(page, fileId));
    const chart = Object.keys(files).find((path) => /^xl\/charts\/chart\d+\.xml$/.test(path));
    expect(chart).toBeDefined();
    const xml = strFromU8(files[chart ?? ""] ?? new Uint8Array());
    expect(xml).toContain("<c:lineChart>");
    expect(xml).toContain("Preise!$B$2:$B$4");
  });

  test("downloads the sheet as a PDF", async ({ page }, testInfo) => {
    await openPreise(page, testInfo);
    const download = page.waitForEvent("download");
    await pick(page, "Datei", "Als PDF herunterladen");
    const file = await download;
    expect(file.suggestedFilename()).toBe("preise.pdf");
    const bytes = await readFile((await file.path()) as string);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

test("puts an image on the sheet and keeps it in the .xlsx", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await createFile(page, "Tabelle", "Mit Logo");
  await expectEditorReady(page, errors);
  const fileId = openFileId(page);
  const logo = solidPng(90, 45, [30, 160, 60]);
  await insertImageFromMenu(page, logo);
  await save(page);
  expect(await storedMedia(page, fileId)).toContainEqual(logo);
});
