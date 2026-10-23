import { join } from "node:path";
import { type Browser, expect, type Page, test, type WebSocketRoute } from "@playwright/test";
import { collectErrors, expectEditorReady, openOwnFolder, save, storedXml, upload } from "./app";
import { paragraphTexts } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/** A second person: a browser context of their own, opening the same file by its address. */
const openAs = async (browser: Browser, url: string): Promise<{ page: Page; errors: string[] }> => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
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

  const ben = await openAs(browser, url);

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
