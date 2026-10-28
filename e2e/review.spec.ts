import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  collectErrors,
  openDocument,
  openFileId,
  openOwnFolder,
  save,
  storedDocx,
  storedXml,
  upload,
} from "./app";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

const openHello = async (page: Page, testInfo: TestInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await openDocument(page, "hello.docx", errors);
  return openFileId(page);
};

const review = async (page: Page, entry: string) => {
  await page.getByRole("menubar").getByRole("menuitem", { name: "Überprüfen", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Überprüfen" });
  await menu
    .getByRole("menuitem", { name: entry, exact: true })
    .or(menu.getByRole("menuitemcheckbox", { name: entry, exact: true }))
    .first()
    .click();
};

/** Types at the start of the first paragraph. */
const typeAtStart = async (page: Page, text: string) => {
  await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(text);
};

test.describe("tracked changes", () => {
  test("tracks what is typed, shows who changed it and keeps the change in the .docx", async ({
    page,
  }, testInfo) => {
    const fileId = await openHello(page, testInfo);
    await review(page, "Änderungen nachverfolgen");
    await page.getByRole("menubar").getByRole("menuitem", { name: "Überprüfen", exact: true }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Änderungen nachverfolgen" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");

    await typeAtStart(page, "Neu ");
    await page.keyboard.press("ArrowLeft");
    const balloon = page.getByRole("region", { name: "Änderung" });
    await expect(balloon.getByTestId("revision-text")).toHaveText("Eingefügt: „Neu “");
    await expect(balloon).toContainText("Anna Berger");
    await save(page);

    const docx = unzipSync(await storedDocx(page, fileId));
    expect(strFromU8(docx["word/settings.xml"] ?? new Uint8Array())).toContain("<w:trackRevisions");
    expect(await storedXml(page, fileId)).toMatch(/<w:ins [^>]*w:author="Anna Berger"[^>]*>.*Neu /s);

    // Saving took the focus; back into the change.
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowRight");
    await balloon.getByRole("button", { name: "Änderung annehmen" }).click();
    await save(page);
    const accepted = await storedXml(page, fileId);
    expect(accepted).not.toContain("<w:ins ");
    expect(accepted).toContain("Neu ");
  });

  test("rejects every change at once", async ({ page }, testInfo) => {
    const fileId = await openHello(page, testInfo);
    await review(page, "Änderungen nachverfolgen");
    await typeAtStart(page, "Weg ");
    await review(page, "Alle Änderungen ablehnen");
    await save(page);
    const xml = await storedXml(page, fileId);
    expect(xml).not.toContain("Weg ");
    expect(xml).toContain("Hallo Schreibzeug");
  });
});
