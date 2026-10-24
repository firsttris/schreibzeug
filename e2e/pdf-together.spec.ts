import { join } from "node:path";
import { type Browser, expect, type Page, type TestInfo, test } from "@playwright/test";
import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFString } from "pdf-lib";
import {
  collectErrors,
  credentialsFor,
  expectEditorReady,
  openOwnFolder,
  save,
  signIn,
  storedDocx,
  upload,
} from "./app";

const formular = join(import.meta.dirname, "../test-files/formular.pdf");

/** A second editor of the same account on another device (collaboration.spec.ts does the same). */
const openAs = async (browser: Browser, url: string, testInfo: TestInfo) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, credentialsFor(testInfo));
  const errors = collectErrors(page);
  await page.goto(url);
  await expectEditorReady(page, errors);
  return { page, errors };
};

const fieldPoint = async (page: Page, x: number, y: number) => {
  const box = await page.getByTestId("engine-frame").boundingBox();
  if (!box) throw new Error("The engine frame is not visible.");
  const scale = (box.width - 180 - 40 - 14) / 595;
  return { x: box.x + 200 + x * scale, y: box.y + 20 + (842 - y) * scale };
};

const notesOf = (pdf: PDFDocument) =>
  (pdf.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? [])
    .map((ref) => pdf.context.lookup(ref, PDFDict))
    .filter((dict) => dict.lookup(PDFName.of("Subtype")) === PDFName.of("Text"))
    .map((dict) => (dict.lookup(PDFName.of("Contents")) as PDFString | undefined)?.decodeText());

test("two people fill in and comment the same PDF and both changes are kept", async ({
  page,
  browser,
}, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, formular, "formular.pdf");
  await page.getByRole("link", { name: "formular.pdf", exact: true }).click();
  await expectEditorReady(page, errors);
  const url = page.url();
  const fileId = url.split("/").at(-1) as string;
  const ben = await openAs(browser, url, testInfo);

  await page.bringToFront();
  const field = await fieldPoint(page, 240, 716);
  await page.mouse.click(field.x, field.y);
  // At a person's pace: in a shared session every key waits for the field's lock from the relay,
  // and the engine drops keys that come meanwhile (docs/pdf.md, "Together").
  await page.keyboard.type("Anna Berger", { delay: 100 });
  await page.mouse.click(field.x, field.y + 250);

  await ben.page.bringToFront();
  await ben.page
    .getByRole("toolbar", { name: "PDF-Werkzeuge" })
    .getByRole("button", { name: "Notiz", exact: true })
    .click();
  await ben.page.getByLabel("Notiz zur Seite").fill("Ben war hier");
  await ben.page
    .getByRole("complementary")
    .getByRole("button", { name: "Kommentieren", exact: true })
    .click();

  // Anna sees Ben's note; a save by either holds both changes.
  await page.bringToFront();
  await expect(page.getByRole("button", { name: "Kommentare" })).toContainText("1", { timeout: 30_000 });
  await page.getByRole("button", { name: "Kommentare" }).click();
  await expect(page.getByRole("complementary").getByText("Ben war hier")).toBeVisible();
  await expect
    .poll(
      async () => {
        await save(page);
        const pdf = await PDFDocument.load(await storedDocx(page, fileId));
        return [pdf.getForm().getTextField("name").getText(), notesOf(pdf).join("|")];
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toEqual(["Anna Berger", "Ben war hier"]);
  expect([...errors, ...ben.errors].filter((line) => line.includes("[engine]"))).toEqual([]);
});
