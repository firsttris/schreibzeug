import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  decodePDFRawStream,
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
} from "pdf-lib";
import { collectErrors, openDocument, openFileId, openOwnFolder, save, storedDocx, upload } from "./app";

const formular = join(import.meta.dirname, "../test-files/formular.pdf");
const anhang = join(import.meta.dirname, "../test-files/anhang.pdf");

/** The newest version on the server, read with pdf-lib. */
const storedPdf = async (page: Page, fileId: string) => PDFDocument.load(await storedDocx(page, fileId));

const engineErrors = (errors: string[]) => errors.filter((line) => line.includes("[engine]"));

/** The annotations of a page by subtype ("Text", "Ink", "Highlight", …), with their text. */
const annotations = (pdf: PDFDocument, index: number) => {
  const annots = pdf.getPage(index).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  return (annots?.asArray() ?? []).map((ref) => {
    const dict = pdf.context.lookup(ref, PDFDict);
    const contents = dict.lookup(PDFName.of("Contents"));
    return {
      subtype: dict.lookup(PDFName.of("Subtype"), PDFName).decodeText(),
      contents: contents instanceof PDFString ? contents.decodeText() : null,
    };
  });
};

/** The page's drawing commands as text, its streams inflated where they are compressed. */
const pageContent = (pdf: PDFDocument, index: number): string => {
  const contents = pdf.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return streams
    .map((ref) => pdf.context.lookup(ref))
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode()))
    .join("\n");
};

/**
 * The text a page shows: its literal strings and hex strings in show-text operators (ISO 32000-1
 * 9.4.3). The test files use WinAnsi codes, one byte per character, and x2t keeps them when it
 * rewrites a page.
 */
const pageText = (content: string): string =>
  [...content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|<([0-9a-f]+)>\s*Tj/gi)]
    .map(([, literal, hex]) =>
      literal !== undefined
        ? literal.replace(/\\(.)/g, "$1")
        : (hex?.match(/../g) ?? []).map((code) => String.fromCharCode(Number.parseInt(code, 16))).join(""),
    )
    .join("");

/**
 * Where a point of the first page (PDF points, origin bottom left, A4) is in the window. The page is
 * fitted to the width right of the engine's page thumbnails (180 px, the frame page), inside the
 * viewer's 20 px margin and left of its 14 px scroll bar (pdf/src/viewer.js).
 */
const onPage = async (page: Page, x: number, y: number) => {
  const box = await page.getByTestId("engine-frame").boundingBox();
  if (!box) throw new Error("The engine frame is not visible.");
  const left = box.x + 180 + 20;
  const scale = (box.width - 180 - 40 - 14) / 595;
  return { x: left + x * scale, y: box.y + 20 + (842 - y) * scale };
};

/** A button of the PDF toolbar; the menu bar has entries of the same names. */
const tool = (page: Page, name: string) =>
  page.getByRole("toolbar", { name: "PDF-Werkzeuge" }).getByRole("button", { name, exact: true });

const openFormular = async (page: Page, testInfo: import("@playwright/test").TestInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, formular, "formular.pdf");
  await openDocument(page, "formular.pdf", errors);
  await expect(page.getByTestId("pdf-position")).toHaveText("Seite 1 von 2");
  return { errors, fileId: openFileId(page) };
};

test("opens a PDF with its pages, turns one, adds a blank page and saves it as a PDF", async ({
  page,
}, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  await tool(page, "Seite nach rechts drehen").click();
  await tool(page, "Leere Seite einfügen").click();
  await expect(page.getByTestId("pdf-position")).toHaveText(/von 3$/);
  await save(page);

  const saved = await storedPdf(page, fileId);
  expect(saved.getPageCount()).toBe(3);
  expect(saved.getPage(0).getRotation()).toEqual(degrees(90));
  expect(saved.getForm().getTextField("name")).toBeTruthy();
  expect(engineErrors(errors)).toEqual([]);
});

test("fills in a form field and keeps the PDF a form", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);
  await page.screenshot({ path: testInfo.outputPath("opened.png") });

  const field = await onPage(page, 240, 716);
  await page.mouse.click(field.x, field.y);
  // Typed at once: no key may go missing while the engine loads the fonts for new characters.
  await page.keyboard.type("Anna Berger");
  // Tab moves to the next field, as in every form (pdf/src/document.js SelectNextForm).
  await page.keyboard.press("Tab");
  await page.keyboard.type("Bühl");
  await page.mouse.click(field.x, field.y + 200);
  await save(page);

  const form = (await storedPdf(page, fileId)).getForm();
  expect(form.getTextField("name").getText()).toBe("Anna Berger");
  expect(form.getTextField("ort").getText()).toBe("Bühl");
  expect(engineErrors(errors)).toEqual([]);
});

test("removes a page, but never the last one", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  await page.getByRole("menubar").getByRole("menuitem", { name: "Seiten", exact: true }).click();
  await page.getByRole("menuitem", { name: "Seiten löschen" }).click();
  await expect(page.getByTestId("pdf-position")).toHaveText("Seite 1 von 1");
  await expect(tool(page, "Seite löschen")).toBeDisabled();
  await save(page);

  const saved = await storedPdf(page, fileId);
  expect(saved.getPageCount()).toBe(1);
  expect(pageText(pageContent(saved, 0))).toContain("Seite zwei");
  expect(engineErrors(errors)).toEqual([]);
});

test("adds a note to a page and draws on it", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  await tool(page, "Notiz").click();
  await page.getByLabel("Notiz zur Seite").fill("Bitte bis Freitag zurück");
  await page.getByRole("complementary").getByRole("button", { name: "Kommentieren", exact: true }).click();
  await expect(page.getByText("Bitte bis Freitag zurück")).toBeVisible();

  await tool(page, "Freihand zeichnen").click();
  const start = await onPage(page, 100, 500);
  const end = await onPage(page, 300, 450);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, start.y + 40, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await tool(page, "Auswählen").click();
  await save(page);

  const kinds = annotations(await storedPdf(page, fileId), 0);
  expect(kinds).toContainEqual({ subtype: "Text", contents: "Bitte bis Freitag zurück" });
  expect(kinds.map((annotation) => annotation.subtype)).toContain("Ink");
  expect(engineErrors(errors)).toEqual([]);
});

test("highlights text with the marker", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  await tool(page, "Text hervorheben").click();
  const from = await onPage(page, 70, 766);
  const to = await onPage(page, 230, 766);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await save(page);

  const kinds = annotations(await storedPdf(page, fileId), 0).map((annotation) => annotation.subtype);
  expect(kinds).toContain("Highlight");
  expect(engineErrors(errors)).toEqual([]);
});

test("blacks out a heading for good", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  // The redact tool draws a box over what is to go (pdfeditor RedactTab.js).
  await tool(page, "Schwärzen").click();
  const from = await onPage(page, 66, 780);
  const to = await onPage(page, 240, 754);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await tool(page, "Schwärzungen anwenden").click();
  await expect(tool(page, "Schwärzen")).toHaveAttribute("aria-pressed", "false");
  await save(page);

  const text = pageText(pageContent(await storedPdf(page, fileId), 0));
  expect(text).not.toContain("Auftragsformular");
  expect(text).toContain("Bitte ausfüllen");
  expect(engineErrors(errors)).toEqual([]);
});

test("signs a PDF with a drawn signature and offers it again next time", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  await tool(page, "Unterschreiben").click();
  const pad = page.getByTestId("signature-pad");
  const box = await pad.boundingBox();
  if (!box) throw new Error("The signature pad is not visible.");
  await page.mouse.move(box.x + 40, box.y + 110);
  await page.mouse.down();
  for (const [x, y] of [
    [80, 40],
    [120, 120],
    [170, 50],
    [220, 115],
    [300, 70],
  ] as const) {
    await page.mouse.move(box.x + x, box.y + y, { steps: 6 });
  }
  await page.mouse.up();
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Unterschreiben" })).toHaveCount(0);
  await save(page);

  const saved = await storedPdf(page, fileId);
  // The signature is ink on the page, as freehand drawing is.
  expect(annotations(saved, 0).map((annotation) => annotation.subtype)).toContain("Ink");
  expect(engineErrors(errors)).toEqual([]);

  // The next PDF can be signed with the same signature in one click.
  await page.reload();
  await expect(page.getByTestId("pdf-position")).toHaveText(/Seite 1 von 2/);
  await tool(page, "Unterschreiben").click();
  await expect(page.getByRole("button", { name: "Letzte Unterschrift" })).toBeVisible();
});

test("appends the pages of another PDF", async ({ page }, testInfo) => {
  const { errors, fileId } = await openFormular(page, testInfo);

  await page.getByTestId("append-pdf-input").setInputFiles(anhang);
  await expect(page.getByTestId("pdf-position")).toHaveText(/von 3$/);
  await save(page);

  const saved = await storedPdf(page, fileId);
  expect(saved.getPageCount()).toBe(3);
  expect(pageText(pageContent(saved, 2))).toContain("Lieferschein 2026-117");
  expect(saved.getForm().getTextField("name")).toBeTruthy();
  expect(engineErrors(errors)).toEqual([]);
});

test("saves a page as a PDF of its own beside the file", async ({ page }, testInfo) => {
  const { errors } = await openFormular(page, testInfo);

  await page.getByRole("menubar").getByRole("menuitem", { name: "Seiten", exact: true }).click();
  await page.getByRole("menuitem", { name: "Als neues PDF speichern" }).click();
  await expect(page.getByTestId("editor-notice")).toHaveText(
    "Seite 1 als „formular – Seite 1.pdf“ gespeichert.",
  );

  await page.getByRole("button", { name: "Zurück" }).click();
  const link = page.getByRole("link", { name: "formular – Seite 1.pdf", exact: true });
  await expect(link).toBeVisible();
  const response = await page.request.get(
    `/api/files/${await link.getAttribute("href").then((href) => href?.split("/").pop())}/content`,
  );
  const extracted = await PDFDocument.load(new Uint8Array(await response.body()));
  expect(extracted.getPageCount()).toBe(1);
  expect(extracted.getForm().getTextField("name")).toBeTruthy();
  expect(engineErrors(errors)).toEqual([]);
});
