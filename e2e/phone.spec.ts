import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { collectErrors, credentialsFor, expectEditorReady, signUp, upload } from "./app";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/** A phone held upright, as in Kontext's tab "Dokumente" or a phone's browser. */
const PHONE_WIDTH = 390;
test.use({ viewport: { width: PHONE_WIDTH, height: 800 }, isMobile: true, hasTouch: true });

/**
 * The page is as wide as the screen: nothing to scroll sideways, nothing cut off at the edge. Not
 * against `innerWidth`: on a phone the layout viewport grows with a page that is too wide.
 */
const expectFitsTheScreen = async (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(PHONE_WIDTH);

test("files and the editor fit a phone's screen", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await signUp(page, credentialsFor(testInfo));
  await page.goto("/");
  await upload(page, helloDocx, "hello.docx");
  await expectFitsTheScreen(page);

  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);
  await expectFitsTheScreen(page);
  // The document gets the room: one row of buttons, which show only their icons and keep their names.
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeInViewport();
  await expect(page.getByRole("toolbar", { name: "Formatierung" })).toBeHidden();
  await expect(page.getByRole("menubar", { name: "Menü" })).toBeHidden();

  // The menus, the file's buttons and the toolbar come with "Werkzeuge".
  await page.getByRole("button", { name: "Werkzeuge" }).click();
  await expect(page.getByRole("menubar", { name: "Menü" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Teilen", exact: true })).toBeInViewport();
  await expect(page.getByRole("toolbar", { name: "Formatierung" })).toBeInViewport();
  await expectFitsTheScreen(page);
});

/** Whether the engine shows the mobile view (word/Drawing/HtmlPage.js IsReaderMode); tests only. */
const inMobileView = async (page: Page): Promise<boolean> => {
  const frame = await (await page.getByTestId("engine-frame").elementHandle())?.contentFrame();
  if (!frame) throw new Error("No engine frame.");
  return frame.evaluate(
    () =>
      (
        window as unknown as { editor?: { WordControl: { IsReaderMode(): boolean } } }
      ).editor?.WordControl.IsReaderMode() ?? false,
  );
};

/** "Als PDF herunterladen", without what changes from one PDF to the next (its time and id). */
const downloadPdf = async (page: Page): Promise<string> => {
  await page.getByRole("menubar").getByRole("menuitem", { name: "Datei", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Als PDF herunterladen" }).click();
  const pdf = (await readFile((await (await download).path()) as string)).toString("latin1");
  return pdf.replace(/\/(CreationDate|ModDate) *\([^)]*\)|\/ID *\[[^\]]*\]|<xmp:\w+Date>[^<]*/g, "");
};

test("a text document opens in the mobile view and its PDF keeps the pages", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await signUp(page, credentialsFor(testInfo));
  await page.goto("/");
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);
  await expect.poll(() => inMobileView(page)).toBe(true);

  // The PDF is drawn from the pages, not from the screen's width: the same as with the pages shown.
  await page.getByRole("button", { name: "Werkzeuge" }).click();
  const fromMobileView = await downloadPdf(page);
  expect(await inMobileView(page)).toBe(true);

  // "Ansicht" switches back to the pages.
  await page.getByRole("menubar").getByRole("menuitem", { name: "Ansicht", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Mobilansicht" }).click();
  await expect.poll(() => inMobileView(page)).toBe(false);
  expect(fromMobileView).toEqual(await downloadPdf(page));
});

test("a presentation keeps its slide list under the slide and its notes hidden", async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await signUp(page, credentialsFor(testInfo));
  await page.goto("/");
  await upload(page, join(import.meta.dirname, "../test-files/vortrag.pptx"), "vortrag.pptx");
  await page.getByRole("link", { name: "vortrag.pptx", exact: true }).click();
  await expectEditorReady(page, errors);
  const frame = await (await page.getByTestId("engine-frame").elementHandle())?.contentFrame();
  if (!frame) throw new Error("No engine frame.");
  // slide/api.js thumbnailsPosition, as the config "thumbnails-position" set it; tests only.
  const position = await frame.evaluate(() => {
    const win = window as unknown as {
      editor: { thumbnailsPosition: number };
      AscCommon: { thumbnailsPositionMap: { bottom: number } };
    };
    return win.editor.thumbnailsPosition === win.AscCommon.thumbnailsPositionMap.bottom;
  });
  expect(position).toBe(true);

  await page.getByRole("button", { name: "Werkzeuge" }).click();
  await page.getByRole("menubar").getByRole("menuitem", { name: "Ansicht", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Notizen" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("the menus stay on a phone's screen", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await signUp(page, credentialsFor(testInfo));
  await page.goto("/");
  await upload(page, helloDocx, "hello.docx");
  await page.getByRole("link", { name: "hello.docx", exact: true }).click();
  await expectEditorReady(page, errors);

  await page.getByRole("button", { name: "Werkzeuge" }).click();
  const menus = await page.getByRole("menubar").getByRole("menuitem").allTextContents();
  const offScreen: string[] = [];
  for (const name of menus) {
    await page.getByRole("menubar").getByRole("menuitem", { name, exact: true }).click();
    const box = await page.getByRole("menu", { name }).boundingBox();
    if (!box || box.x < 0 || box.x + box.width > PHONE_WIDTH) offScreen.push(name);
    await page.keyboard.press("Escape");
  }
  expect(offScreen).toEqual([]);
});
