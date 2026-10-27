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
  // The buttons show only their icons here, and keep their names.
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Teilen", exact: true })).toBeInViewport();
});
