import { join } from "node:path";
import { type Browser, expect, type Page, type TestInfo, test, type WebSocketRoute } from "@playwright/test";
import {
  collectErrors,
  createFile,
  credentialsFor,
  expectEditorReady,
  openOwnFolder,
  save,
  signIn,
  storedDocx,
  storedXml,
  upload,
} from "./app";
import { paragraphTexts, partXml } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/**
 * A second editor: a browser context of its own, signed in and opening the same file by its
 * address. Until files can be shared it is the same account on another device.
 */
const openAs = async (
  browser: Browser,
  url: string,
  testInfo: TestInfo,
): Promise<{ page: Page; errors: string[] }> => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, credentialsFor(testInfo));
  const errors = collectErrors(page);
  await page.goto(url);
  await expectEditorReady(page, errors);
  return { page, errors };
};

/**
 * Types at the start of the document. The page comes to the front first: of two windows only the
 * front one gets keys into the engine.
 */
const typeAtStart = async (page: Page, text: string) => {
  await page.bringToFront();
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(text);
};

test("two people edit the same document and see each other's text", async ({ page, browser }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);
  const url = page.url();
  const fileId = url.split("/").at(-1) as string;

  const ben = await openAs(browser, url, testInfo);

  await typeAtStart(page, "Anna schreibt. ");
  // Changes travel on their own in fast co-editing; Ben's copy has them once his save stores them.
  await expect
    .poll(
      async () => {
        await save(ben.page);
        return paragraphTexts(await storedXml(ben.page, fileId)).join("|");
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toContain("Anna schreibt.");

  await typeAtStart(ben.page, "Ben auch. ");
  await expect
    .poll(
      async () => {
        await save(page);
        return paragraphTexts(await storedXml(page, fileId)).join("|");
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toContain("Ben auch. Anna schreibt.");
  expect([...errors, ...ben.errors].filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("someone who loses the connection waits, reconnects and edits on", async ({
  page,
  browser,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);
  const url = page.url();
  const fileId = url.split("/").at(-1) as string;

  // Ben's connection runs through the test, so the test can cut it.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const links: WebSocketRoute[] = [];
  await context.routeWebSocket(/\/api\/collab\//, (socket) => {
    socket.connectToServer();
    links.push(socket);
  });
  const ben = await context.newPage();
  await signIn(ben, credentialsFor(testInfo));
  const benErrors = collectErrors(ben);
  await ben.goto(url);
  await expectEditorReady(ben, benErrors);

  const status = ben.getByTestId("editor-status");
  const linksBefore = links.length;
  await (links.at(-1) as WebSocketRoute).close();
  // The engine takes no edits while the others cannot see them; the status line says why.
  await expect(status).toHaveAttribute("data-connected", "false");
  await expect.poll(() => links.length, { timeout: 15_000 }).toBeGreaterThan(linksBefore);
  await expect(status).toHaveAttribute("data-connected", "true", { timeout: 15_000 });

  await typeAtStart(ben, "Wieder da. ");
  await expect
    .poll(
      async () => {
        await save(page);
        return paragraphTexts(await storedXml(page, fileId)).join("|");
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toContain("Wieder da. Hallo Stapel");
  expect([...errors, ...benErrors].filter((line) => line.includes("[engine]"))).toEqual([]);
});

test("changes are stored on their own, and everyone sees when they are", async ({
  page,
  browser,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);
  const url = page.url();
  const fileId = url.split("/").at(-1) as string;
  const ben = await openAs(browser, url, testInfo);

  await typeAtStart(ben.page, "Von selbst. ");
  // Nobody presses "Speichern": Ben's editor stores his change a few seconds after he stops.
  await expect
    .poll(async () => paragraphTexts(await storedXml(page, fileId)).join("|"), {
      timeout: 30_000,
      intervals: [1_000],
    })
    .toContain("Von selbst. Hallo Stapel");
  for (const someone of [page, ben.page]) {
    await expect(someone.getByTestId("editor-status")).toHaveAttribute("data-modified", "false");
    await expect(someone.getByTestId("editor-status")).toHaveText("Gespeichert");
  }
  expect([...errors, ...ben.errors].filter((line) => line.includes("[engine]"))).toEqual([]);
});

/** The texts of a workbook; empty before the first save, as the blank file has none. */
const sharedStrings = (xlsx: Uint8Array): string => {
  try {
    return partXml(xlsx, "xl/sharedStrings.xml");
  } catch {
    return "";
  }
};

test("two people fill the same spreadsheet", async ({ page, browser }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await createFile(page, "Tabelle", "Gemeinsam");
  await expectEditorReady(page, errors);
  const url = page.url();
  const fileId = url.split("/").at(-1) as string;
  const ben = await openAs(browser, url, testInfo);

  const typeInto = async (who: Page, reference: string, text: string) => {
    await who.bringToFront();
    const box = who.frameLocator('[data-testid="engine-frame"]').locator("#name-box");
    await box.fill(reference);
    await box.press("Enter");
    await who.keyboard.type(text);
    await who.keyboard.press("Enter");
  };
  const valueAt = async (who: Page, reference: string) => {
    const frame = who.frameLocator('[data-testid="engine-frame"]');
    await frame.locator("#name-box").fill(reference);
    await frame.locator("#name-box").press("Enter");
    return frame.locator("#ce-cell-content").inputValue();
  };

  await typeInto(page, "A1", "Anna");
  await expect.poll(() => valueAt(ben.page, "A1"), { timeout: 30_000 }).toBe("Anna");
  await typeInto(ben.page, "B1", "Ben");
  await expect.poll(() => valueAt(page, "B1"), { timeout: 30_000 }).toBe("Ben");

  // Stored on its own, with both texts (spreadsheets keep texts in the shared strings).
  await expect
    .poll(async () => sharedStrings(await storedDocx(page, fileId)), {
      timeout: 30_000,
      intervals: [1_000],
    })
    .toMatch(/Anna[\s\S]*Ben|Ben[\s\S]*Anna/);
  expect([...errors, ...ben.errors].filter((line) => line.includes("[engine]"))).toEqual([]);
});
