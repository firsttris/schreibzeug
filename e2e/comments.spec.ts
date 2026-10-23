import { join } from "node:path";
import { expect, test } from "@playwright/test";
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
  await expect(card).toContainText("Hallo Stapel");
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
