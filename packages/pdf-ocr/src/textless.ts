import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  type PDFPage,
  PDFRawStream,
  PDFStream,
} from "pdf-lib";

/** Text-showing operators inside a text object (ISO 32000-1 9.4.3): Tj, TJ, ' and ". */
const SHOWS_TEXT = /\bBT\b[\s\S]*?(?:\bTj\b|\bTJ\b|['"](?=\s))/;

/** How deep form XObjects inside form XObjects are followed. */
const MAX_DEPTH = 3;

const streamText = (stream: PDFObject | undefined): string => {
  if (stream instanceof PDFRawStream)
    return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
  if (stream instanceof PDFStream) return new TextDecoder("latin1").decode(stream.getContents());
  return "";
};

/** The page's content: one stream or an array of them, as one text. */
const contentText = (page: PDFPage): string => {
  const contents = page.node.Contents();
  const lookup = (object: PDFObject) => page.doc.context.lookup(object);
  if (contents instanceof PDFArray) return contents.asArray().map(lookup).map(streamText).join("\n");
  return streamText(contents);
};

/** Whether a form XObject among these resources shows text (a page may draw its text in one). */
const formsShowText = (resources: PDFDict | undefined, depth: number): boolean => {
  const xObjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xObjects || depth > MAX_DEPTH) return false;
  return xObjects.keys().some((key) => {
    const object = xObjects.lookup(key);
    if (!(object instanceof PDFStream) || object.dict.get(PDFName.of("Subtype")) !== PDFName.of("Form")) {
      return false;
    }
    return (
      SHOWS_TEXT.test(streamText(object)) ||
      formsShowText(object.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), depth + 1)
    );
  });
};

const showsText = (page: PDFPage): boolean =>
  SHOWS_TEXT.test(contentText(page)) || formsShowText(page.node.Resources(), 1);

/** How many pages the PDF has and which of them, from 0, show no text. */
export type TextlessPages = { count: number; textless: number[] };

/**
 * The pages that show no text: scanned pages, whose letters are only pixels. Text in annotations
 * and form fields does not count; it is not the page's own.
 */
export const textlessPages = async (pdf: Uint8Array): Promise<TextlessPages> => {
  const pages = (await PDFDocument.load(pdf, { updateMetadata: false })).getPages();
  return { count: pages.length, textless: pages.flatMap((page, index) => (showsText(page) ? [] : [index])) };
};
