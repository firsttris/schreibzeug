import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { collectErrors, openDocument, openOwnFolder, row, upload } from "./app";

const testFile = (name: string) => join(import.meta.dirname, "../test-files", name);

const menu = async (page: Page, item: string) => {
  await page.getByRole("menubar").getByRole("button", { name: "Serienbrief", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
};

/** The paragraphs' text of a stored .docx. */
const paragraphsOf = (docx: Uint8Array) =>
  [
    ...strFromU8(unzipSync(docx)["word/document.xml"] ?? new Uint8Array()).matchAll(/<w:p\b[\s\S]*?<\/w:p>/g),
  ].map(([paragraph]) =>
    [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(""),
  );

test("merges a letter with Word's merge fields and a table of recipients into one document", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, testFile("empfaenger.xlsx"), "empfaenger.xlsx");
  await upload(page, testFile("einladung.docx"), "einladung.docx");
  await openDocument(page, "einladung.docx", errors);

  await menu(page, "Empfänger wählen …");
  const dialog = page.getByRole("dialog", { name: "Empfänger wählen" });
  await dialog.getByRole("button", { name: "empfaenger.xlsx wählen" }).click();
  await expect(dialog.getByTestId("recipients-preview")).toContainText(
    "3 Empfänger, Felder Anrede, Name, Straße, PLZ, Ort",
  );
  await expect(dialog.getByTestId("recipients-preview")).toContainText("Lindenweg 3a");
  await dialog.getByRole("button", { name: "Übernehmen" }).click();

  const bar = page.getByRole("region", { name: "Serienbrief" });
  await expect(bar).toContainText("empfaenger.xlsx · 3 Empfänger");
  // Every field of the letter is a column of the table.
  await expect(bar.getByRole("alert")).toHaveCount(0);

  // One more field, at the end of the letter.
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 400 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Bis bald in ");
  await bar.getByRole("button", { name: "Feld Ort einfügen" }).click();

  await bar.getByRole("button", { name: "Vorschau" }).click();
  await expect(bar.getByRole("status")).toHaveText("Empfänger 1 von 3");
  await bar.getByRole("button", { name: "Nächster Empfänger" }).click();
  await expect(bar.getByRole("status")).toHaveText("Empfänger 2 von 3");
  await bar.getByRole("button", { name: "Vorschau beenden" }).click();

  await bar.getByRole("button", { name: "Serienbrief erstellen" }).click();
  await expect(page.getByText("3 Briefe als „einladung – Serienbrief.docx“ gespeichert.")).toBeVisible({
    timeout: 60_000,
  });

  await page.goBack();
  const merged = row(page, "einladung – Serienbrief.docx");
  await expect(merged).toBeVisible();
  const href = await merged.getByRole("link").first().getAttribute("href");
  const id = href?.match(/\/edit\/([0-9a-f-]{36})/)?.[1];
  const response = await page.request.get(`/api/files/${id}/content`);
  const paragraphs = paragraphsOf(new Uint8Array(await response.body()));
  const text = paragraphs.join("\n");
  expect(paragraphs.filter((paragraph) => paragraph === "Einladung zum Projektstart")).toHaveLength(3);
  for (const line of [
    "Frau Anna Berger",
    "Lindenweg 3a",
    "76530 Baden-Baden",
    "Herr Ben Krüger",
    "77815 Bühl",
    "Frau Clara Hoffmann",
  ]) {
    expect(text).toContain(line);
  }
  expect(text).toContain("Bis bald in Rastatt");
  expect(text).not.toContain("«");
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("takes recipients from a CSV on the computer and names the fields the table lacks", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, testFile("einladung.docx"), "einladung.docx");
  await openDocument(page, "einladung.docx", errors);

  await menu(page, "Empfänger wählen …");
  const dialog = page.getByRole("dialog", { name: "Empfänger wählen" });
  await dialog.getByTestId("recipients-input").setInputFiles({
    name: "kunden.csv",
    mimeType: "text/csv",
    // As German Excel writes CSV: semicolons, Windows-1252.
    buffer: Buffer.from("Name;Ort\r\nJürgen Weiß;Bühl\r\n", "latin1"),
  });
  await expect(dialog.getByTestId("recipients-preview")).toContainText("Jürgen Weiß");
  await dialog.getByRole("button", { name: "Übernehmen" }).click();

  const bar = page.getByRole("region", { name: "Serienbrief" });
  await expect(bar).toContainText("kunden.csv · 1 Empfänger");
  await expect(bar.getByRole("alert")).toContainText("«Anrede», «Straße», «PLZ»");
});
