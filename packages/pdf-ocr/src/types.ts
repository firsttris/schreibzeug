/** A rectangle on the page image, in pixels from its top left (as Tesseract reports words). */
export type Box = { x0: number; y0: number; x1: number; y1: number };

export type RecognizedWord = { text: string; box: Box };

/** The words of one line, left to right. */
export type RecognizedLine = RecognizedWord[];

/** What was recognised on one page, drawn as an image of this size. */
export type RecognizedPage = {
  /** The page, from 0. */
  page: number;
  image: { width: number; height: number };
  lines: RecognizedLine[];
};
