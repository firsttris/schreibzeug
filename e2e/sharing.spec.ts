import { join } from "node:path";
import { type Browser, expect, type Page, type TestInfo, test } from "@playwright/test";
import {
  collectErrors,
  credentialsFor,
  expectEditorReady,
  openOwnFolder,
  row,
  save,
  signUp,
  storedXml,
  upload,
} from "./app";
import { paragraphTexts } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/**
 * The text the engine shows, read from its document model (word/Editor/DocumentContentBase.js
 * GetText; word/api.js keeps the API on `window.editor`). Only a test looks there.
 */
const documentText = async (page: Page): Promise<string> => {
  const frame = await (await page.getByTestId("engine-frame").elementHandle())?.contentFrame();
  if (!frame) throw new Error("No engine frame.");
  return frame.evaluate(() => {
    const engine = (
      window as unknown as { editor?: { WordControl: { m_oLogicDocument: { GetText(): string } } } }
    ).editor;
    return engine?.WordControl.m_oLogicDocument.GetText() ?? "";
  });
};

/** A second person, in a browser of their own, with an account of their own. */
const signUpBen = async (browser: Browser, testInfo: TestInfo): Promise<{ page: Page; email: string }> => {
  const own = credentialsFor(testInfo);
  const email = own.email.replace("@", "-ben@");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signUp(page, { name: "Ben Krämer", email, password: own.password });
  return { page, email };
};

/** Shares the row's folder or file through its dialog. */
const share = async (page: Page, name: string, email: string, role: "Darf bearbeiten" | "Darf ansehen") => {
  await page.getByRole("button", { name: `${name} teilen` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-Mail des Kontos").fill(email);
  await dialog.getByLabel("Recht", { exact: true }).selectOption({ label: role });
  await dialog.getByRole("button", { name: "Teilen", exact: true }).click();
  await expect(dialog.locator(`[data-share="${email}"]`)).toContainText("Ben Krämer");
  await dialog.getByRole("button", { name: "Fertig" }).click();
};

/** Annas test folder, with hello.docx in it, shared with Ben. */
const shareFolderWithBen = async (
  page: Page,
  browser: Browser,
  testInfo: TestInfo,
  role: "Darf bearbeiten" | "Darf ansehen",
) => {
  const folder = await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  const ben = await signUpBen(browser, testInfo);
  await page.getByRole("link", { name: "Meine Dateien" }).first().click();
  await share(page, folder, ben.email, role);
  return { folder, ben };
};

test("a folder shared to look at opens read-only for the other person", async ({
  page,
  browser,
}, testInfo) => {
  const { folder, ben } = await shareFolderWithBen(page, browser, testInfo, "Darf ansehen");

  await ben.page.goto("/shared");
  await expect(row(ben.page, folder)).toContainText("von Anna Berger · darf ansehen");
  await ben.page.getByRole("link", { name: folder, exact: true }).click();
  await expect(ben.page.getByRole("navigation", { name: "Pfad" })).toContainText("Für mich freigegeben");
  await expect(ben.page.getByRole("button", { name: "Neu", exact: true })).toHaveCount(0);
  await expect(ben.page.getByRole("button", { name: "hello.docx umbenennen" })).toHaveCount(0);

  const errors = collectErrors(ben.page);
  await ben.page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(ben.page, errors);
  await expect(ben.page.getByTestId("editor-status")).toHaveText("Nur ansehen");
  await expect(ben.page.getByRole("button", { name: "Speichern", exact: true })).toHaveCount(0);
  await expect(ben.page.getByRole("toolbar")).toHaveCount(0);

  // Anna edits; Ben's read-only engine follows along (a live viewer, common/apiBase.js).
  const annaErrors = collectErrors(page);
  await page.goto(ben.page.url());
  await expectEditorReady(page, annaErrors);
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Anna schreibt. ");
  await expect.poll(() => documentText(ben.page), { timeout: 30_000 }).toContain("Anna schreibt.");
});

test("someone a folder is shared with to edit changes a document in it", async ({
  page,
  browser,
}, testInfo) => {
  const { folder, ben } = await shareFolderWithBen(page, browser, testInfo, "Darf bearbeiten");

  await ben.page.goto("/shared");
  await ben.page.getByRole("link", { name: folder, exact: true }).click();
  // An editor may rename, but moving, sharing and the trash stay with the owner.
  await expect(ben.page.getByRole("button", { name: "hello.docx umbenennen" })).toHaveCount(1);
  await expect(ben.page.getByRole("button", { name: "hello.docx in den Papierkorb" })).toHaveCount(0);

  const errors = collectErrors(ben.page);
  await ben.page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(ben.page, errors);
  const fileId = ben.page.url().split("/").at(-1) as string;
  await ben.page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await ben.page.keyboard.press("Control+Home");
  await ben.page.keyboard.type("Ben war hier. ");
  await save(ben.page);

  // Anna reads her own file, which now holds Ben's text.
  expect(paragraphTexts(await storedXml(page, fileId)).join("|")).toContain("Ben war hier.");
});

test("someone without an account follows a link, signs up and gets the folder", async ({
  page,
  browser,
}, testInfo) => {
  const folder = await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "Meine Dateien" }).first().click();
  await page.getByRole("button", { name: `${folder} teilen` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Recht des Links").selectOption({ label: "Darf bearbeiten" });
  await dialog.getByRole("button", { name: "Link erstellen" }).click();
  const url = await dialog.getByLabel("Link", { exact: true }).inputValue();
  expect(url).toMatch(/\/invite\/[\w-]{32}$/);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ben = await context.newPage();
  await ben.goto(url);
  await expect(ben.getByTestId("invitation")).toHaveText(
    `Anna Berger teilt den Ordner „${folder}“ mit dir. Du darfst bearbeiten.`,
  );
  await ben.getByRole("link", { name: "Konto anlegen" }).click();
  const email = credentialsFor(testInfo).email.replace("@", "-link@");
  await ben.getByLabel("Name").fill("Ben Krämer");
  await ben.getByLabel("E-Mail").fill(email);
  await ben.getByLabel("Passwort").fill("geheim-genug");
  await ben.getByRole("button", { name: "Konto anlegen" }).click();
  await ben.getByRole("button", { name: "Einladung annehmen" }).click();
  await expect(ben.getByRole("heading", { level: 1 })).toHaveText(folder);
  await expect(row(ben, "hello.docx")).toBeVisible();

  // The owner sees Ben among the people the folder is shared with.
  await page.reload();
  await page.getByRole("button", { name: `${folder} teilen` }).click();
  await expect(page.getByRole("dialog").locator(`[data-share="${email}"]`)).toContainText("Ben Krämer");
});
