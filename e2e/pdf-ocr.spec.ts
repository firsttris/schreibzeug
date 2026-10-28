import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { textlessPages } from "@schreibzeug/pdf-ocr";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { collectErrors, openDocument, openFileId, openOwnFolder, storedDocx, upload } from "./app";

/** A4 at 150 dpi, as an office scanner saves a letter. */
const SCAN = { width: 1240, height: 1754 };

/** Text drawn into an image by the browser: a scanned letter, its words only pixels. */
const scannedLetter = async (page: Page): Promise<Uint8Array> => {
  const png = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#111";
    context.font = "bold 56px sans-serif";
    context.fillText("Rechnung 4711", 150, 260);
    context.font = "36px sans-serif";
    context.fillText("Bitte zahlen Sie bis zum 31. Oktober.", 150, 380);
    return canvas.toDataURL("image/png");
  }, SCAN);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);
  pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  return pdf.save();
};

/** The text a page shows with Tj, read as WinAnsi: here, what the text layer put there. */
const shownText = async (pdf: Uint8Array): Promise<string> => {
  const document = await PDFDocument.load(pdf);
  const contents = document.getPage(0).node.Contents();
  const streams =
    contents instanceof PDFArray ? contents.asArray().map((ref) => document.context.lookup(ref)) : [contents];
  const content = streams
    .map((stream) =>
      stream instanceof PDFRawStream
        ? new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode())
        : "",
    )
    .join("\n");
  return [...content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)]
    .map(([, hex]) => new TextDecoder("latin1").decode(Uint8Array.from(Buffer.from(hex ?? "", "hex"))))
    .join("");
};

test("recognises the text of a scanned PDF and stores it searchable", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  const scan = testInfo.outputPath("scan.pdf");
  writeFileSync(scan, await scannedLetter(page));
  await upload(page, scan, "scan.pdf");
  await openDocument(page, "scan.pdf", errors);
  const fileId = openFileId(page);

  // A PDF of images says so, and offers to recognise its text.
  const notice = page.getByTestId("scan-notice");
  await expect(notice).toContainText("Dieses PDF besteht nur aus Bildern");
  await notice.getByRole("button", { name: "Text erkennen" }).click();
  const dialog = page.getByRole("dialog", { name: "Text erkennen" });
  await dialog.getByRole("button", { name: "Text erkennen" }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await expect(dialog).toHaveCount(0, { timeout: 180_000 });

  // The new version opens: no longer only images.
  await expect(notice).toHaveCount(0, { timeout: 60_000 });
  const stored = await storedDocx(page, fileId);
  expect((await textlessPages(stored)).textless).toEqual([]);
  const text = await shownText(stored);
  expect(text).toContain("Rechnung 4711");
  expect(text).toContain("Oktober");

  // A second run, once the new version is open, finds nothing left to do.
  await expect(
    page
      .getByRole("toolbar", { name: "PDF-Werkzeuge" })
      .getByRole("button", { name: "Seite nach rechts drehen" }),
  ).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("menubar").getByRole("menuitem", { name: "Seiten", exact: true }).click();
  await page.getByRole("menuitem", { name: "Text erkennen (OCR) …" }).click();
  await dialog.getByRole("button", { name: "Text erkennen" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Jede Seite des PDFs enthält schon Text.");
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});
