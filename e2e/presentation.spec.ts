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

const vortrag = join(import.meta.dirname, "../test-files/vortrag.pptx");

/**
 * Clicks into the title of the slide shown and selects its text. The slide sits right of the
 * engine's slide list, fitted to the frame; its title is in the upper middle.
 */
const editTitle = async (page: Page) => {
  const frame = page.getByTestId("engine-frame");
  const box = await frame.boundingBox();
  if (!box) throw new Error("The engine frame is not visible.");
  await frame.click({ position: { x: 260 + (box.width - 260) / 2, y: box.height * 0.4 } });
  await page.keyboard.press("Control+A");
};

const slideXml = async (page: Page, fileId: string, slide: number) =>
  partXml(await storedDocx(page, fileId), `ppt/slides/slide${slide}.xml`);

test("creates a presentation, gives it a title and a second slide", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await createFile(page, "Präsentation", "Vortrag");
  await expectEditorReady(page, errors);
  const fileId = openFileId(page);
  await expect(page.getByTestId("slide-position")).toHaveText("Folie 1 von 1");

  await editTitle(page);
  await page.keyboard.type("Mein Vortrag");
  await page.getByRole("button", { name: "Neue Folie" }).click();
  await page.getByRole("menuitem", { name: "Titel und Inhalt" }).click();
  await expect(page.getByTestId("slide-position")).toHaveText("Folie 2 von 2");
  await save(page);

  expect(await slideXml(page, fileId, 1)).toContain("<a:t>Mein Vortrag</a:t>");
  expect(await slideXml(page, fileId, 2)).toContain('type="title"');
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("opens a .pptx with its slides, makes the title bold and keeps it", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, vortrag, "vortrag.pptx");
  await openDocument(page, "vortrag.pptx", errors);
  const fileId = openFileId(page);
  await expect(page.getByTestId("slide-position")).toHaveText("Folie 1 von 3");

  await editTitle(page);
  await page.getByRole("button", { name: "Fett" }).click();
  await expect(page.getByRole("button", { name: "Fett" })).toHaveAttribute("aria-pressed", "true");
  await save(page);

  const xml = await slideXml(page, fileId, 1);
  expect(xml).toMatch(/<a:rPr[^>]*b="1"[^>]*>(?:(?!<\/a:r>)[\s\S])*<a:t>Lagerverwaltung<\/a:t>/);
  expect(await slideXml(page, fileId, 3)).toContain("<a:t>Zeitplan</a:t>");
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("duplicates and deletes slides", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, vortrag, "vortrag.pptx");
  await openDocument(page, "vortrag.pptx", errors);
  const fileId = openFileId(page);

  await page.getByRole("button", { name: "Folie duplizieren" }).click();
  await expect(page.getByTestId("slide-position")).toHaveText("Folie 2 von 4");
  await page.getByRole("button", { name: "Folie löschen" }).click();
  await page.getByRole("button", { name: "Folie löschen" }).click();
  await expect(page.getByTestId("slide-position")).toHaveText(/von 2$/);
  await save(page);

  const presentation = partXml(await storedDocx(page, fileId), "ppt/presentation.xml");
  expect(presentation.match(/<p:sldId /g)).toHaveLength(2);
});
