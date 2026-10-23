import { expect, type Page, type TestInfo } from "@playwright/test";
import { documentXml } from "./docx";

/** The newest version on the server, as bytes. */
export const storedDocx = async (page: Page, fileId: string): Promise<Uint8Array> => {
  const response = await page.request.get(`/api/files/${fileId}/content`);
  expect(response.ok()).toBe(true);
  return new Uint8Array(await response.body());
};

/**
 * Steps through the app as a person would. Every test works in a folder of its own, so tests run
 * in parallel against one server without seeing each other's files.
 */

/** The engine reports its errors only to the console; keep them for the failure message. */
export const collectErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  return errors;
};

const fillNameDialog = async (page: Page, label: string, name: string, confirm: string) => {
  const input = page.getByLabel(label);
  await input.fill(name);
  await page.getByRole("button", { name: confirm, exact: true }).click();
};

export const row = (page: Page, name: string) => page.locator(`tr[data-node="${name}"]`);

/** Creates a folder named after the test (and its retry) in "Meine Dateien" and opens it. */
export const openOwnFolder = async (page: Page, testInfo: TestInfo): Promise<string> => {
  // Unique per run of a test, also with --repeat-each and on a retry.
  const name = `${testInfo.title.slice(0, 40)} ${testInfo.testId.slice(0, 8)}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Neuer Ordner" }).click();
  await fillNameDialog(page, "Name des Ordners", name, "Anlegen");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return name;
};

export const createFolder = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Neuer Ordner" }).click();
  await fillNameDialog(page, "Name des Ordners", name, "Anlegen");
};

export const upload = async (page: Page, path: string, name: string) => {
  await page.getByTestId("upload-input").setInputFiles(path);
  await expect(row(page, name)).toBeVisible();
};

export const rename = async (page: Page, from: string, to: string) => {
  await page.getByRole("button", { name: `${from} umbenennen` }).click();
  await fillNameDialog(page, "Neuer Name", to, "Umbenennen");
};

export const createDocument = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Neues Dokument" }).click();
  await fillNameDialog(page, "Name des Dokuments", name, "Anlegen und öffnen");
};

/** Waits until the editor has opened the document, and fails with the engine's errors if it did not. */
export const expectEditorReady = async (page: Page, errors: string[]) => {
  const status = page.getByTestId("editor-status");
  await expect(status).not.toHaveAttribute("data-status", "loading", { timeout: 90_000 });
  if ((await status.getAttribute("data-status")) !== "ready") {
    throw new Error(`The document did not open: ${await status.textContent()}\n${errors.join("\n")}`);
  }
};

export const openDocument = async (page: Page, name: string, errors: string[]) => {
  await page.getByRole("link", { name, exact: true }).click();
  await expectEditorReady(page, errors);
};

/** The id of the file open in the editor, from the URL /edit/<id>. */
export const openFileId = (page: Page): string => {
  const id = new URL(page.url()).pathname.match(/^\/edit\/([0-9a-f-]{36})$/)?.[1];
  if (!id) throw new Error(`Not in the editor: ${page.url()}`);
  return id;
};

/** Saves to the server and waits until the server has the new version and the editor says so. */
export const save = async (page: Page) => {
  const stored = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().endsWith("/content"),
  );
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  expect((await stored).ok()).toBe(true);
  const status = page.getByTestId("editor-status");
  await expect(status).toHaveAttribute("data-modified", "false");
  await expect(status).toHaveText("Gespeichert");
};

/** The main document part of the newest version on the server. */
export const storedXml = async (page: Page, fileId: string): Promise<string> =>
  documentXml(await storedDocx(page, fileId));
