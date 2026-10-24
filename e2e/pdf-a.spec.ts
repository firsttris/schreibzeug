import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { collectErrors, openDocument, openOwnFolder, upload } from "./app";

/** An item of the "Datei" menu that downloads a file, and the file that arrives. */
const download = async (page: Page, item: string) => {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menubar").getByRole("button", { name: "Datei", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
  const file = await download;
  return {
    name: file.suggestedFilename(),
    bytes: new Uint8Array(await readFile((await file.path()) as string)),
  };
};

/**
 * What makes a PDF/A-2 file and what keeps its text usable (ISO 19005-2 6.2.4, 6.2.11, 6.6.2): the
 * conformance in the XMP metadata, an output intent, and every font embedded, with a ToUnicode map
 * so the text can be searched and copied.
 */
const pdfaTraits = async (bytes: Uint8Array) => {
  const pdf = await PDFDocument.load(bytes);
  const metadata = pdf.catalog.lookup(PDFName.of("Metadata"));
  const xmp =
    metadata instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(metadata).decode()) : "";
  const fonts = [...pdf.context.enumerateIndirectObjects()]
    .map(([, object]) => object)
    .filter(
      (object): object is PDFDict =>
        object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Font"),
    );
  const embedded = (font: PDFDict) => {
    // A Type0 font keeps its descriptor in its one descendant font.
    const descendant = font.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray)?.lookup(0, PDFDict);
    const descriptor = (descendant ?? font).lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
    return ["FontFile", "FontFile2", "FontFile3"].some((key) => descriptor?.has(PDFName.of(key)));
  };
  const simpleFonts = fonts.filter((font) => font.get(PDFName.of("Subtype")) !== PDFName.of("CIDFontType2"));
  return {
    part: /pdfaid:part(?:>|=")(\d)/.exec(xmp)?.[1] ?? null,
    outputIntent: pdf.catalog.has(PDFName.of("OutputIntents")),
    fonts: simpleFonts.length,
    allEmbedded: simpleFonts.every(embedded),
    searchable: simpleFonts.every((font) => font.has(PDFName.of("ToUnicode"))),
  };
};

test("downloads a text document as PDF-A with its fonts embedded", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  await upload(page, join(import.meta.dirname, "../test-files/hello.docx"), "hello.docx");
  await openDocument(page, "hello.docx", errors);

  const { name, bytes } = await download(page, "Als PDF/A herunterladen");
  expect(name).toBe("hello (PDF-A).pdf");
  const traits = await pdfaTraits(bytes);
  expect(traits).toMatchObject({ part: "2", outputIntent: true, allEmbedded: true, searchable: true });
  expect(traits.fonts).toBeGreaterThan(0);
});

test("downloads a PDF as PDF-A with the changes made and its text still text", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openOwnFolder(page, testInfo);
  // A PDF that embeds its fonts, as Schreibzeug writes one from a text document. (x2t cannot embed
  // the 14 standard fonts a PDF may leave out, docs/pdf.md; their text becomes outlines.)
  await upload(page, join(import.meta.dirname, "../test-files/hello.docx"), "hello.docx");
  await openDocument(page, "hello.docx", errors);
  const pdfPath = testInfo.outputPath("brief.pdf");
  await writeFile(pdfPath, (await download(page, "Als PDF herunterladen")).bytes);
  await page.goBack();
  await upload(page, pdfPath, "brief.pdf");
  await openDocument(page, "brief.pdf", errors);
  await page
    .getByRole("toolbar", { name: "PDF-Werkzeuge" })
    .getByRole("button", { name: "Seite nach rechts drehen" })
    .click();

  const { name, bytes } = await download(page, "Als PDF/A herunterladen");
  expect(name).toBe("brief (PDF-A).pdf");
  const traits = await pdfaTraits(bytes);
  expect(traits).toMatchObject({ part: "2", outputIntent: true, allEmbedded: true, searchable: true });
  expect(traits.fonts).toBeGreaterThan(0);
  // The turned page: x2t may draw it turned, or keep the page's /Rotate.
  const first = (await PDFDocument.load(bytes)).getPage(0);
  const { width, height } = first.getSize();
  expect(first.getRotation().angle % 180 === 90 ? height > width : width > height).toBe(true);
  expect(errors.filter((line) => line.includes("[engine]"))).toEqual([]);
});
