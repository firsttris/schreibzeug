import type { RecognizedLine } from "@schreibzeug/pdf-ocr";
import type { Block } from "tesseract.js";

/** The code that lays text over a PDF (pdf-lib) loads when it is needed, not with the app. */
export const loadPdfOcr = () => import("@schreibzeug/pdf-ocr");

/** Tesseract's resolution for the page images: what scanners use for text, and its own default. */
export const OCR_DPI = 300;

/** The recognised words line by line, from Tesseract's blocks → paragraphs → lines → words. */
export const linesOf = (blocks: Block[] | null): RecognizedLine[] =>
  (blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines
        .map((line) =>
          line.words
            .filter((word) => word.text.trim() !== "")
            .map((word) => ({ text: word.text, box: word.bbox })),
        )
        .filter((words) => words.length > 0),
    ),
  );

/**
 * The page image as a PNG. The engine draws pages into canvases of its frame, which Tesseract does
 * not take for canvases (its loadImage tests instanceof against this window's HTMLCanvasElement).
 */
const pngOf = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Die Seite ließ sich nicht als Bild lesen."))),
      "image/png",
    ),
  );

export type Recognizer = {
  /** The text on the image, in lines of words with where they are. */
  recognize: (image: HTMLCanvasElement) => Promise<RecognizedLine[]>;
  close: () => Promise<void>;
};

/**
 * Tesseract in a worker of this page, German and English, with every file from the app's own
 * /ocr (ocr-plugin.ts): nothing goes to a CDN or any other server.
 */
export const createRecognizer = async (onProgress: (fraction: number) => void): Promise<Recognizer> => {
  const { createWorker, OEM } = await import("tesseract.js");
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
  const worker = await createWorker(["deu", "eng"], OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(message.progress);
    },
  });
  await worker.setParameters({ user_defined_dpi: String(OCR_DPI) });
  return {
    recognize: async (image) =>
      linesOf((await worker.recognize(await pngOf(image), {}, { blocks: true })).data.blocks),
    close: async () => {
      await worker.terminate();
    },
  };
};

/** Where text recognition is: which page of how many, and how far along that page. */
export type OcrStep = { page: number; of: number; fraction: number };

export type SearchableInput = {
  /** The PDF as saved. */
  pdf: Uint8Array;
  /** A page of it, from 0, as an image at OCR_DPI; null for one that cannot be drawn. */
  render: (page: number) => HTMLCanvasElement | null;
  recognizer: (onProgress: (fraction: number) => void) => Promise<Recognizer>;
  onStep: (step: OcrStep) => void;
};

export type Searchable = { ok: true; pdf: Uint8Array; pages: number } | { ok: false; error: string };

/**
 * Recognises the text of the pages that have none and lays it over them (@schreibzeug/pdf-ocr).
 * Pages with text stay as they are, so a second run changes nothing.
 */
export const makeSearchable = async ({
  pdf,
  render,
  recognizer,
  onStep,
}: SearchableInput): Promise<Searchable> => {
  const { addTextLayer, textlessPages } = await loadPdfOcr();
  const { textless } = await textlessPages(pdf);
  if (textless.length === 0) return { ok: false, error: "Jede Seite des PDFs enthält schon Text." };
  let current = { page: 0, of: textless.length, fraction: 0 };
  const worker = await recognizer((fraction) => {
    current = { ...current, fraction };
    onStep(current);
  });
  try {
    const recognized = [];
    for (const [position, page] of textless.entries()) {
      current = { page: position + 1, of: textless.length, fraction: 0 };
      onStep(current);
      const image = render(page);
      if (!image) continue;
      recognized.push({
        page,
        image: { width: image.width, height: image.height },
        lines: await worker.recognize(image),
      });
    }
    const found = recognized.filter((page) => page.lines.length > 0);
    if (found.length === 0) return { ok: false, error: "Auf den Seiten ohne Text wurde kein Text erkannt." };
    return { ok: true, pdf: await addTextLayer(pdf, found), pages: found.length };
  } finally {
    await worker.close();
  }
};
