import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import {
  collectErrors,
  expectEditorReady,
  openDocument,
  openFileId,
  openOwnFolder,
  row,
  save,
  storedXml,
  upload,
} from "./app";
import { runPropertiesOf } from "./docx";

const helloDocx = join(import.meta.dirname, "../test-files/hello.docx");

/** hello.docx in a folder of the test's own, open in the editor. */
const openHello = async (page: Page, testInfo: TestInfo): Promise<{ fileId: string; folder: string }> => {
  const errors = collectErrors(page);
  const folder = await openOwnFolder(page, testInfo);
  await upload(page, helloDocx, "hello.docx");
  await openDocument(page, "hello.docx", errors);
  return { fileId: openFileId(page), folder };
};

/** Opens a menu of the menu bar and picks an entry. */
const pick = async (page: Page, menu: string, entry: string) => {
  await page.getByRole("menubar").getByRole("button", { name: menu, exact: true }).click();
  await page
    .getByRole("menu", { name: menu })
    .getByRole("menuitem", { name: entry })
    .or(page.getByRole("menu", { name: menu }).getByRole("menuitemcheckbox", { name: entry }))
    .first()
    .click();
};

test.describe("menus of the text editor", () => {
  test("formats through the menu bar and shows what is set", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await pick(page, "Bearbeiten", "Alles auswählen");
    await pick(page, "Format", "Fett");
    await expect(page.getByRole("button", { name: "Fett", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pick(page, "Format", "Hochgestellt");

    await page.getByRole("menubar").getByRole("button", { name: "Format" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: /^Fett/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");

    await save(page);
    const properties = runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("");
    expect(properties).toContain("<w:b");
    expect(properties).toContain('w:vertAlign w:val="superscript"');
  });

  test("zooms from the view menu", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    await pick(page, "Ansicht", "150 %");
    await page.getByRole("menubar").getByRole("button", { name: "Ansicht" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "150 %" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("renames the file in the title", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    const title = page.getByLabel("Dateiname");
    await expect(title).toHaveValue("hello");
    await title.fill("Angebot 2026");
    await title.press("Enter");
    await expect(title).toHaveValue("Angebot 2026");

    await page.getByRole("button", { name: "Zurück" }).click();
    await expect(row(page, "Angebot 2026.docx")).toBeVisible();
  });

  test("makes a copy and opens it in a new tab", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    const tab = page.waitForEvent("popup");
    await pick(page, "Datei", "Kopie erstellen");
    const copy = await tab;
    await expectEditorReady(copy, collectErrors(copy));
    await expect(copy.getByLabel("Dateiname")).toHaveValue("hello (Kopie)");
  });

  test("tells where the source code is", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    await pick(page, "Hilfe", "Über Stapel");
    await expect(page.getByRole("dialog").getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/firsttris/stapel",
    );
  });

  test("opens its own menu on a right click in the document", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 }, button: "right" });
    const menu = page.getByRole("menu", { name: "Kontextmenü" });
    await expect(menu.getByRole("menuitem", { name: "Kopieren" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Zeile löschen" })).toHaveCount(0);

    await menu.getByRole("menuitem", { name: "Alles auswählen" }).click();
    await expect(menu).toHaveCount(0);
    await pick(page, "Format", "Kursiv");
    await save(page);
    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Stapel").join("")).toContain("<w:i");
  });
});
