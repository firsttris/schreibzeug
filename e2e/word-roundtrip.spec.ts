import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { collectErrors, openDocument, openFileId, openOwnFolder, save, storedXml, upload } from "./app";
import { paragraphTexts, runPropertiesOf } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/** Uploads hello.docx into a folder of the test's own and opens it in the editor. */
const openHello = async (page: Page, testInfo: TestInfo): Promise<string> => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await openDocument(page, "hello.docx", errors);
  return openFileId(page);
};

const selectAllInDocument = (page: Page) => page.getByRole("button", { name: "Alles auswählen" }).click();

test.describe("text document round trip without a document server", () => {
  test("opens a .docx and saves it back with its content", async ({ page }, testInfo) => {
    const fileId = await openHello(page, testInfo);

    await save(page);

    const xml = await storedXml(page, fileId);
    expect(paragraphTexts(xml)).toEqual(["Hallo Stapel", "Zweiter Absatz mit kursivem Text."]);
    expect(runPropertiesOf(xml, "kursivem").join("")).toContain("<w:i");
  });

  test("makes the selection bold and writes it into the .docx", async ({ page }, testInfo) => {
    const fileId = await openHello(page, testInfo);
    await selectAllInDocument(page);

    const bold = page.getByRole("button", { name: "Fett" });
    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Rückgängig" })).toBeEnabled();
    await expect(page.getByTestId("editor-status")).toHaveAttribute("data-modified", "true");

    await save(page);

    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("")).toContain("<w:b");
  });

  test("undoes a change", async ({ page }, testInfo) => {
    const fileId = await openHello(page, testInfo);
    await selectAllInDocument(page);

    await page.getByRole("button", { name: "Fett" }).click();
    await page.getByRole("button", { name: "Rückgängig" }).click();

    await expect(page.getByRole("button", { name: "Fett" })).toHaveAttribute("aria-pressed", "false");
    await save(page);
    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("")).not.toContain("<w:b");
  });

  test("shows the font size of the selection", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    await selectAllInDocument(page);

    const size = page.getByTestId("font-size");
    await expect(size).not.toHaveText("–");
    const before = Number(await size.textContent());
    await page.getByRole("button", { name: "Schrift vergrößern" }).click();
    await expect(size).toHaveText(String(before + 1));
  });

  test("keeps every save as a version", async ({ page }, testInfo) => {
    const fileId = await openHello(page, testInfo);
    await selectAllInDocument(page);
    await page.getByRole("button", { name: "Kursiv" }).click();
    await save(page);

    const versions = await (await page.request.get(`/api/files/${fileId}/versions`)).json();
    expect(versions.map((version: { number: number }) => version.number)).toEqual([2, 1]);
  });
});
