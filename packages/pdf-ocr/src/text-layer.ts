import {
  beginText,
  endText,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  StandardFonts,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from "pdf-lib";
import type { Box, RecognizedLine, RecognizedPage } from "./types";

/**
 * Lays the recognised text over the pages, invisible (text rendering mode 3, ISO 32000-1 9.3.6),
 * the way OCRmyPDF makes scans searchable: each word sits where its letters are on the image,
 * stretched to their width, so a search finds it and a selection covers it. The page looks as
 * before. Helvetica is not embedded: invisible text is never drawn, and readers bring it along.
 */
export const addTextLayer = async (pdf: Uint8Array, pages: RecognizedPage[]): Promise<Uint8Array> => {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  const encodable = new Set(font.getCharacterSet());
  const all = document.getPages();
  for (const recognized of pages) {
    const page = all[recognized.page];
    if (page) layOver(page, font, encodable, recognized);
  }
  return document.save({ useObjectStreams: false });
};

/** WinAnsi has no glyph for some characters Tesseract may return; those become "?". */
const encodableText = (text: string, encodable: Set<number>) =>
  Array.from(text, (char) => (encodable.has(char.codePointAt(0) ?? 0) ? char : "?")).join("");

/** Where an image box lies on the page: page units from the bottom left of what is shown. */
const toPage = (page: PDFPage, image: RecognizedPage["image"], box: Box) => {
  const shown = page.getCropBox();
  const scaleX = shown.width / image.width;
  const scaleY = shown.height / image.height;
  return {
    x: shown.x + box.x0 * scaleX,
    // The baseline at the bottom of the box: descenders reach a little below it, which a selection
    // does not need to match.
    y: shown.y + shown.height - box.y1 * scaleY,
    width: (box.x1 - box.x0) * scaleX,
    height: (box.y1 - box.y0) * scaleY,
  };
};

const layOver = (page: PDFPage, font: PDFFont, encodable: Set<number>, recognized: RecognizedPage) => {
  const fontKey = page.node.newFontDictionary("OcrText", font.ref);
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    ...recognized.lines.flatMap((line) =>
      lineOperators(page, font, encodable, recognized.image, fontKey, line),
    ),
    endText(),
    popGraphicsState(),
  );
};

const lineOperators = (
  page: PDFPage,
  font: PDFFont,
  encodable: Set<number>,
  image: RecognizedPage["image"],
  fontKey: ReturnType<PDFPage["node"]["newFontDictionary"]>,
  line: RecognizedLine,
) =>
  line.flatMap((word, index) => {
    const text = encodableText(word.text.trim(), encodable);
    if (!text) return [];
    const place = toPage(page, image, word.box);
    const size = Math.max(place.height, 1);
    const natural = font.widthOfTextAtSize(text, size);
    // A space after every word but the line's last, so copied text keeps its words apart; the
    // stretch is measured without it.
    const shown = index < line.length - 1 ? `${text} ` : text;
    return [
      setFontAndSize(fontKey, size),
      setCharacterSqueeze(natural > 0 ? (100 * place.width) / natural : 100),
      setTextMatrix(1, 0, 0, 1, place.x, place.y),
      showText(font.encodeText(shown)),
    ];
  });
