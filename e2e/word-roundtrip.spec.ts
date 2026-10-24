import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { unzipSync } from "fflate";
import {
  collectErrors,
  insertImageFromMenu,
  openDocument,
  openFileId,
  openOwnFolder,
  save,
  storedDocx,
  storedMedia,
  storedXml,
  upload,
} from "./app";
import { paragraphTexts, runPropertiesOf } from "./docx";
import { solidPng } from "./png";

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

  test("takes typing again after a toolbar button had the focus", async ({ page }, testInfo) => {
    const fileId = await openHello(page, testInfo);
    await save(page);

    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Neu: ");
    await save(page);

    expect(paragraphTexts(await storedXml(page, fileId))[0]).toBe("Neu: Hallo Stapel");
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

    // The editor may also have saved on its own (three seconds after the change) before the click.
    const versions = await (await page.request.get(`/api/files/${fileId}/versions`)).json();
    const numbers: number[] = versions.map((version: { number: number }) => version.number);
    expect(numbers.length).toBeGreaterThanOrEqual(2);
    expect(numbers).toEqual(numbers.map((_, index) => numbers.length - index));
  });
});

test("shows the images of a document and keeps them when saving", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(
    page,
    join(import.meta.dirname, "../test-files/fidelity/image-noborder.docx"),
    "image-noborder.docx",
  );
  await openDocument(page, "image-noborder.docx", errors);
  const fileId = openFileId(page);
  const before = await storedDocx(page, fileId);
  const images = (bytes: Uint8Array) =>
    Object.keys(unzipSync(bytes)).filter((name) => name.startsWith("word/media/"));
  expect(images(before).length).toBeGreaterThan(0);

  // An edit, so the save writes the document anew from the engine.
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Text");
  await save(page);
  expect(images(await storedDocx(page, fileId))).toEqual(images(before));
});

test("puts an image from the computer into the document and saves it in the file", async ({
  page,
}, testInfo) => {
  const fileId = await openHello(page, testInfo);
  const logo = solidPng(120, 60, [200, 30, 40]);
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.press("Control+End");

  await insertImageFromMenu(page, logo);
  await save(page);

  expect(await storedMedia(page, fileId)).toContainEqual(logo);
  expect(await storedXml(page, fileId)).toContain("<pic:pic");
});
