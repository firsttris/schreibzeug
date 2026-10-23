import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import {
  collectErrors,
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
});
