import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  collectErrors,
  createFolder,
  credentialsFor,
  expectEditorReady,
  openFileId,
  openOwnFolder,
  row,
  signUp,
  storedXml,
  upload,
} from "./app";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

const fromTemplate = async (page: Page, template: string, name: string) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Aus Vorlage …" }).click();
  const dialog = page.getByRole("dialog", { name: "Neu aus Vorlage" });
  // The radio itself is hidden behind its card (sr-only); the card is what people click.
  await dialog.getByRole("radio", { name: new RegExp(`^${template}`) }).check({ force: true });
  await dialog.getByLabel("Name der neuen Datei").fill(name);
  await dialog.getByRole("button", { name: "Anlegen und öffnen" }).click();
};

test.describe("templates", () => {
  test("starts an invoice from the built-in template", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openOwnFolder(page, testInfo);
    await fromTemplate(page, "Rechnung", "Rechnung 2026-001");
    await expectEditorReady(page, errors);
    const xml = await storedXml(page, openFileId(page));
    expect(xml).toContain("Rechnungsnummer");
    expect(xml).toContain("Steuernummer");
  });

  test("offers the files in Vorlagen as own templates and keeps them as they are", async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await signUp(page, credentialsFor(testInfo));
    await page.goto("/");
    await createFolder(page, "Vorlagen");
    await page.getByRole("link", { name: "Vorlagen", exact: true }).click();
    await upload(page, helloDocx, "hello.docx");
    await page.getByRole("navigation", { name: "Pfad" }).getByRole("link", { name: "Meine Dateien" }).click();

    await fromTemplate(page, "hello", "Aus eigener Vorlage");
    await expectEditorReady(page, errors);
    expect(await storedXml(page, openFileId(page))).toContain("Hallo Schreibzeug");

    await page.goto("/");
    await expect(row(page, "Aus eigener Vorlage.docx")).toBeVisible();
    await page.getByRole("link", { name: "Vorlagen", exact: true }).click();
    await expect(row(page, "hello.docx")).toBeVisible();
  });
});
