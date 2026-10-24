import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  collectErrors,
  expectEditorReady,
  openDocument,
  openFileId,
  openOwnFolder,
  row,
  save,
  storedDocx,
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
    const properties = runPropertiesOf(await storedXml(page, fileId), "Hallo Schreibzeug").join("");
    expect(properties).toContain("<w:b");
    expect(properties).toContain('w:vertAlign w:val="superscript"');
  });

  test("sets up the page and the line spacing", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await pick(page, "Layout", "Querformat");
    await pick(page, "Layout", "A5");
    await pick(page, "Layout", "Ränder schmal");
    await pick(page, "Format", "Zeilenabstand 1,5");

    await page.getByRole("menubar").getByRole("button", { name: "Layout" }).click();
    for (const entry of ["Querformat", "A5", "Ränder schmal"]) {
      await expect(page.getByRole("menuitemcheckbox", { name: entry })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
    await page.keyboard.press("Escape");

    await save(page);
    const xml = await storedXml(page, fileId);
    // Twentieths of a point: A5 lying is 210 × 148 mm, 12.7 mm is 720.
    const size = xml.match(/<w:pgSz [^>]*>/)?.[0] ?? "";
    expect(size).toContain('w:w="11906"');
    expect(size).toMatch(/w:h="839\d"/);
    expect(size).toContain('w:orient="landscape"');
    expect(xml).toMatch(/<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/);
    expect(xml).toMatch(/<w:spacing [^>]*w:line="360" w:lineRule="auto"/);
  });

  test("writes a header and puts page numbers in the footer", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await pick(page, "Einfügen", "Kopfzeile bearbeiten");
    await page.keyboard.type("Muster GmbH");
    await page.getByRole("menubar").getByRole("button", { name: "Einfügen", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Kopf- und Fußzeile schließen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await pick(page, "Einfügen", "Kopf- und Fußzeile schließen");
    await pick(page, "Einfügen", "Seitenzahl unten mittig");
    await save(page);

    // The header and footer parts the document now has, by what they hold.
    const parts = Object.entries(unzipSync(await storedDocx(page, fileId)))
      .filter(([name]) => /^word\/(header|footer)\d+\.xml$/.test(name))
      .map(([, bytes]) => strFromU8(bytes));
    expect(parts.some((xml) => xml.includes("Muster GmbH"))).toBe(true);
    expect(parts.some((xml) => /<w:ftr[\s\S]*PAGE/.test(xml))).toBe(true);
    expect(await storedXml(page, fileId)).toContain("Hallo Schreibzeug");
  });

  test("puts in a table of contents, a section break and a footnote", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.getByRole("combobox", { name: "Absatzvorlage" }).selectOption({ label: "Überschrift 1" });
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+Home");
    await pick(page, "Einfügen", "Inhaltsverzeichnis");
    await page.keyboard.press("Control+End");
    await pick(page, "Einfügen", "Abschnittsumbruch (nächste Seite)");
    await page.keyboard.type("Anhang");
    await pick(page, "Einfügen", "Fußnote");
    await page.keyboard.type("Quelle: Handbuch");
    await save(page);

    const files = unzipSync(await storedDocx(page, fileId));
    const xml = strFromU8(files["word/document.xml"] as Uint8Array);
    expect(xml).toContain("TOC \\o &quot;1-9&quot;");
    expect(xml).toContain("<w:footnoteReference");
    expect(xml.match(/<w:sectPr/g)?.length).toBeGreaterThanOrEqual(2);
    // The break ends the section with the paragraph before it (its properties hold the section's);
    // the new section holds "Anhang" and the note mark.
    expect(xml).toMatch(/<w:sectPr>[\s\S]*Zweiter Absatz[\s\S]*Anhang[\s\S]*<w:footnoteReference/);
    expect(strFromU8(files["word/footnotes.xml"] as Uint8Array)).toContain("Quelle: Handbuch");
  });

  test("puts a text box on the page and writes into it", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await pick(page, "Einfügen", "Textfeld");
    await page.keyboard.type("Notiz am Rand");
    await save(page);
    expect(await storedXml(page, fileId)).toMatch(/<w:txbxContent>[\s\S]*Notiz am Rand/);
  });

  test("links text with Strg+K, edits the link from the context menu and keeps it", async ({
    page,
  }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Link einfügen" });
    await expect(dialog.getByLabel("Angezeigter Text")).toHaveValue("Hallo Schreibzeug");
    await dialog.getByLabel("Adresse").fill("schreibzeug.dev");
    await dialog.getByRole("button", { name: "Einfügen" }).click();

    // A right click on the linked text offers to edit it.
    await page.getByTestId("engine-frame").click({ position: { x: 230, y: 210 }, button: "right" });
    await page
      .getByRole("menu", { name: "Kontextmenü" })
      .getByRole("menuitem", { name: "Link bearbeiten …" })
      .click();
    const edit = page.getByRole("dialog", { name: "Link bearbeiten" });
    await expect(edit.getByLabel("Adresse")).toHaveValue("http://schreibzeug.dev");
    await edit.getByLabel("Adresse").fill("https://schreibzeug.dev/hilfe");
    await edit.getByRole("button", { name: "Ändern" }).click();
    await save(page);

    const files = unzipSync(await storedDocx(page, fileId));
    expect(strFromU8(files["word/_rels/document.xml.rels"] as Uint8Array)).toContain(
      'Target="https://schreibzeug.dev/hilfe"',
    );
    expect(await storedXml(page, fileId)).toMatch(
      /<w:hyperlink [^>]*>[\s\S]*Hallo Schreibzeug[\s\S]*<\/w:hyperlink>/,
    );
  });

  test("highlights text and copies formatting with the format painter", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    const frame = page.getByTestId("engine-frame");
    await frame.click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Shift+End");
    await page.getByRole("button", { name: "Hervorheben" }).click();
    await page.getByRole("button", { name: "Gelb" }).click();
    await expect(page.getByRole("button", { name: "Format übertragen" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // From the italic second paragraph onto the first line, dragged with the mouse.
    await frame.click({ position: { x: 300, y: 255 } });
    await page.getByRole("button", { name: "Format übertragen" }).click();
    await expect(page.getByRole("button", { name: "Format übertragen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const box = await frame.boundingBox();
    if (!box) throw new Error("The engine frame is not visible.");
    await page.mouse.move(box.x + 186, box.y + 210);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 210, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Format übertragen" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await save(page);

    const properties = runPropertiesOf(await storedXml(page, fileId), "Hallo").join("");
    expect(properties).toContain("<w:i");
    expect(properties).not.toContain("w:highlight");
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
    await pick(page, "Hilfe", "Über Schreibzeug");
    await expect(page.getByRole("dialog").getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/firsttris/schreibzeug",
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
    expect(runPropertiesOf(await storedXml(page, fileId), "Hallo Schreibzeug").join("")).toContain("<w:i");
  });
});

test.describe("find and replace", () => {
  test("finds while typing and replaces all", async ({ page }, testInfo) => {
    const { fileId } = await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+h");
    const bar = page.getByRole("search", { name: "Suchen und ersetzen" });
    await bar.getByLabel("Suchen", { exact: true }).fill("Schreibzeug");
    await expect(bar.getByTestId("search-result")).toHaveText("1 von 1");
    await bar.getByLabel("Suchen", { exact: true }).fill("gibt es nicht");
    await expect(bar.getByTestId("search-result")).toHaveText("Keine Treffer");

    await bar.getByLabel("Suchen", { exact: true }).fill("Schreibzeug");
    await bar.getByLabel("Ersetzen durch").fill("Ordner");
    await bar.getByRole("button", { name: "Alle ersetzen" }).click();
    await expect(bar.getByTestId("search-result")).toHaveText("1 ersetzt");
    await bar.getByRole("button", { name: "Suche schließen" }).click();
    await expect(bar).toHaveCount(0);

    await save(page);
    expect(await storedXml(page, fileId)).toContain("Hallo Ordner");
  });

  test("opens from the edit menu", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    await pick(page, "Bearbeiten", "Suchen");
    await expect(page.getByRole("search").getByLabel("Suchen", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Ersetzen durch")).toHaveCount(0);
  });
});

test.describe("PDF", () => {
  test("downloads the document as a PDF with its fonts", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    const download = page.waitForEvent("download");
    await pick(page, "Datei", "Als PDF herunterladen");
    const file = await download;
    expect(file.suggestedFilename()).toBe("hello.pdf");
    const bytes = await readFile((await file.path()) as string);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.toString("latin1")).toMatch(/\/FontFile2?/);
  });

  test("prints through the browser's dialog with Strg+P", async ({ page }, testInfo) => {
    await openHello(page, testInfo);
    await page.getByTestId("engine-frame").click({ position: { x: 640, y: 210 } });
    await page.keyboard.press("Control+p");
    await expect(page.locator('iframe[title="Drucken"]')).toHaveCount(1);
  });
});
