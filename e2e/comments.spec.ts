import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { collectErrors, openDocument, openFileId, openOwnFolder, save, storedDocx, upload } from "./app";
import { documentXml, partXml } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

test("comments on a selection, answers, resolves and deletes it", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await openDocument(page, "hello.docx", errors);
  const fileId = openFileId(page);
  await page.getByRole("button", { name: "Alles auswählen" }).click();

  await page.getByRole("button", { name: "Kommentar hinzufügen" }).click();
  await page.getByRole("textbox", { name: "Kommentar zur Auswahl" }).fill("Bitte prüfen");
  await page.getByRole("button", { name: "Kommentieren", exact: true }).click();

  const card = page.getByRole("article", { name: "Kommentar von Anna Berger" });
  await expect(card).toContainText("Bitte prüfen");
  await expect(card).toContainText("Hallo Schreibzeug");
  await expect(page.getByRole("button", { name: "Kommentare", exact: true })).toContainText("1");

  await card.getByRole("textbox", { name: "Antworten" }).fill("Ist erledigt");
  await card.getByRole("button", { name: "Antworten", exact: true }).click();
  await expect(card).toContainText("Ist erledigt");

  await save(page);
  const saved = await storedDocx(page, fileId);
  const comments = partXml(saved, "word/comments.xml");
  expect(comments).toContain("Bitte prüfen");
  expect(comments).toContain("Ist erledigt");
  expect(documentXml(saved)).toContain("<w:commentRangeStart");

  await card.getByRole("button", { name: "Als erledigt markieren" }).click();
  await expect(card).toHaveAttribute("data-resolved", "true");

  await card.getByRole("button", { name: "Kommentar löschen" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await save(page);
  expect(documentXml(await storedDocx(page, fileId))).not.toContain("<w:commentRangeStart");
});

test("comments on a slide and keeps the comment in the .pptx", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, join(import.meta.dirname, "../test-files/vortrag.pptx"), "vortrag.pptx");
  await openDocument(page, "vortrag.pptx", errors);
  const fileId = openFileId(page);

  await page.getByRole("menubar").getByRole("menuitem", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menu", { name: "Einfügen" }).getByRole("menuitem", { name: "Kommentar" }).click();
  await page.getByRole("textbox", { name: "Kommentar zur Folie" }).fill("Titel kürzer?");
  await page.getByRole("button", { name: "Kommentieren", exact: true }).click();
  const card = page.getByRole("article", { name: "Kommentar von Anna Berger" });
  await expect(card).toContainText("Titel kürzer?");
  await expect(page.getByRole("button", { name: "Kommentare", exact: true })).toContainText("1");

  await save(page);
  const parts = Object.entries(unzipSync(await storedDocx(page, fileId)))
    .filter(([name]) => name.startsWith("ppt/comments/"))
    .map(([, bytes]) => strFromU8(bytes));
  expect(parts.join("")).toContain("Titel kürzer?");
});

test("comments on a cell, answers it and keeps it in the .xlsx", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, join(import.meta.dirname, "../test-files/preise.xlsx"), "preise.xlsx");
  await openDocument(page, "preise.xlsx", errors);
  const fileId = openFileId(page);
  const nameBox = page.frameLocator('[data-testid="engine-frame"]').locator("#name-box");
  await nameBox.fill("B2");
  await nameBox.press("Enter");

  await page.getByRole("menubar").getByRole("menuitem", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menu", { name: "Einfügen" }).getByRole("menuitem", { name: "Kommentar" }).click();
  await page.getByRole("textbox", { name: "Kommentar zur Zelle" }).fill("Preis von 2025?");
  await page.getByRole("button", { name: "Kommentieren", exact: true }).click();
  const card = page.getByRole("article", { name: "Kommentar von Anna Berger" });
  await expect(card).toContainText("Preis von 2025?");
  await expect(card).toContainText("B2");
  await card.getByRole("textbox", { name: "Antworten" }).fill("Ja, noch alt");
  await card.getByRole("button", { name: "Antworten", exact: true }).click();
  await expect(card).toContainText("Ja, noch alt");

  await save(page);
  const parts = Object.entries(unzipSync(await storedDocx(page, fileId)))
    .filter(([name]) => /^xl\/(comments|threadedComments)/.test(name))
    .map(([, bytes]) => strFromU8(bytes))
    .join("");
  expect(parts).toContain("Preis von 2025?");
  expect(parts).toContain("Ja, noch alt");
});
