import { expect, type Page, type TestInfo } from "@playwright/test";
import { unzipSync } from "fflate";
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

export type Credentials = { name: string; email: string; password: string };

/** An account of its own for every run of a test, also with --repeat-each and on a retry. */
export const credentialsFor = (testInfo: TestInfo): Credentials => {
  const key = `${testInfo.testId}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  return { name: "Anna Berger", email: `${key}@example.org`, password: "geheim-genug" };
};

/**
 * Creates the account through the API; `page.request` shares the browser's cookies, so the page
 * is signed in afterwards. Signing up through the form is tested once, in accounts.spec.ts.
 */
export const signUp = async (page: Page, credentials: Credentials) => {
  const response = await page.request.post("/api/auth/sign-up/email", { data: credentials });
  expect(response.ok(), await response.text()).toBe(true);
};

export const signIn = async (page: Page, { email, password }: Credentials) => {
  const response = await page.request.post("/api/auth/sign-in/email", { data: { email, password } });
  expect(response.ok(), await response.text()).toBe(true);
};

/**
 * Signs up the test's own account, creates a folder named after the test in "Meine Dateien" and
 * opens it.
 */
export const openOwnFolder = async (page: Page, testInfo: TestInfo): Promise<string> => {
  await signUp(page, credentialsFor(testInfo));
  const name = `${testInfo.title.slice(0, 40)} ${testInfo.testId.slice(0, 8)}`;
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
  // The dialog is closed and the list shows the folder before the next step clicks anything.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, name)).toBeVisible();
};

export const upload = async (page: Page, path: string, name: string) => {
  await page.getByTestId("upload-input").setInputFiles(path);
  await expect(row(page, name)).toBeVisible();
};

export const rename = async (page: Page, from: string, to: string) => {
  await page.getByRole("button", { name: `${from} umbenennen` }).click();
  await fillNameDialog(page, "Neuer Name", to, "Umbenennen");
};

const NAME_LABELS = {
  Dokument: "Name des Dokuments",
  Tabelle: "Name der Tabelle",
  Präsentation: "Name der Präsentation",
} as const;

/** "Neu" → Dokument, Tabelle or Präsentation, named, created and opened. */
export const createFile = async (page: Page, kind: keyof typeof NAME_LABELS, name: string) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: kind }).click();
  await fillNameDialog(page, NAME_LABELS[kind], name, "Anlegen und öffnen");
};

export const createDocument = (page: Page, name: string) => createFile(page, "Dokument", name);

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

/** Einfügen → Bild … in the menu bar, with the image given to the browser's file dialog. */
export const insertImageFromMenu = async (page: Page, png: Uint8Array) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menubar").getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menu", { name: "Einfügen" }).getByRole("menuitem", { name: "Bild …" }).click();
  await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await expect(page.getByTestId("editor-status")).toHaveAttribute("data-modified", "true");
};

/** The images in the stored Office file (word/media, xl/media, ppt/media). */
export const storedMedia = async (page: Page, fileId: string): Promise<Uint8Array[]> =>
  Object.entries(unzipSync(await storedDocx(page, fileId)))
    .filter(([name]) => /^(word|xl|ppt)\/media\//.test(name))
    .map(([, bytes]) => bytes);
