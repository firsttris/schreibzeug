import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import {
  collectErrors,
  createDocument,
  expectEditorReady,
  openDocument,
  openFileId,
  openOwnFolder,
  save,
  storedDocx,
  storedXml,
  upload,
} from "./app";
import { paragraphWith, runPropertiesOf, styleNameOf } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/** hello.docx in a folder of the test's own, open, with everything selected. */
const openSelected = async (page: Page, testInfo: TestInfo): Promise<string> => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await openDocument(page, "hello.docx", errors);
  await page.getByRole("button", { name: "Alles auswählen" }).click();
  return openFileId(page);
};

test.describe("formatting a text document", () => {
  test("strikes text through", async ({ page }, testInfo) => {
    const fileId = await openSelected(page, testInfo);
    const strike = page.getByRole("button", { name: "Durchgestrichen" });
    await strike.click();
    await expect(strike).toHaveAttribute("aria-pressed", "true");

    await save(page);
    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("")).toContain("<w:strike");
  });

  test("colours text with one of Word's standard colours", async ({ page }, testInfo) => {
    const fileId = await openSelected(page, testInfo);
    await page.getByRole("button", { name: "Schriftfarbe" }).click();
    await page.getByRole("button", { name: "Rot", exact: true }).click();

    await save(page);
    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("")).toMatch(
      /<w:color w:val="FF0000"/i,
    );
  });

  test("sets a font the engine offers", async ({ page }, testInfo) => {
    const fileId = await openSelected(page, testInfo);
    const font = page.getByRole("combobox", { name: "Schriftart" });
    await expect(font.locator("option", { hasText: "Liberation Serif" })).toHaveCount(1);
    await font.selectOption("Liberation Serif");
    await expect(font).toHaveValue("Liberation Serif");

    await save(page);
    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("")).toContain(
      'w:ascii="Liberation Serif"',
    );
  });

  test("turns paragraphs into a bulleted list and back", async ({ page }, testInfo) => {
    const fileId = await openSelected(page, testInfo);
    const bullets = page.getByRole("button", { name: "Aufzählung" });
    await bullets.click();
    await expect(bullets).toHaveAttribute("aria-pressed", "true");

    await save(page);
    expect(paragraphWith(await storedXml(page, fileId), "Hallo Stapel")).toContain("<w:numPr>");

    await bullets.click();
    await expect(bullets).toHaveAttribute("aria-pressed", "false");
    await save(page);
    expect(paragraphWith(await storedXml(page, fileId), "Hallo Stapel")).not.toContain("<w:numPr>");
  });

  test("numbers paragraphs", async ({ page }, testInfo) => {
    const fileId = await openSelected(page, testInfo);
    await page.getByRole("button", { name: "Nummerierung" }).click();
    await expect(page.getByRole("button", { name: "Nummerierung" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Aufzählung" })).toHaveAttribute("aria-pressed", "false");

    await save(page);
    expect(paragraphWith(await storedXml(page, fileId), "Zweiter Absatz")).toContain("<w:numPr>");
  });

  test("applies a heading style, named in German", async ({ page }, testInfo) => {
    const fileId = await openSelected(page, testInfo);
    const style = page.getByRole("combobox", { name: "Absatzvorlage" });
    await expect(style).toHaveValue("Normal");
    await style.selectOption({ label: "Überschrift 1" });
    await expect(style).toHaveValue("Heading 1");

    await save(page);
    expect(styleNameOf(await storedDocx(page, fileId), "Hallo Stapel")).toMatch(/^heading 1$/i);
  });

  test("inserts a table from the grid and adds a row", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await createDocument(page, "Tabelle");
    await expectEditorReady(page, errors);
    const fileId = openFileId(page);

    const table = page.getByRole("button", { name: "Tabelle", exact: true });
    await table.click();
    await page.getByRole("button", { name: "Tabelle 3 × 2" }).click();
    await expect(table).toHaveAttribute("aria-pressed", "true");

    await save(page);
    expect(tableShape(await storedXml(page, fileId))).toEqual([3, 3]);

    await table.click();
    await page.getByRole("menuitem", { name: "Zeile unterhalb einfügen" }).click();
    await save(page);
    expect(tableShape(await storedXml(page, fileId))).toEqual([3, 3, 3]);
  });
});

/** The number of cells in each row of the first table. */
const tableShape = (xml: string): number[] => {
  const table = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0] ?? "";
  return [...table.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(([row]) => row.match(/<w:tc>/g)?.length ?? 0);
};
