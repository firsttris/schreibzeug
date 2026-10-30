/** A page drawn for printing: the picture and the page's size in points (1/72 inch). */
export type PrintPage = { image: Blob; width: number; height: number };

type BrowserInfo = { pdfViewerEnabled?: boolean | undefined; userAgent: string };

/** Safari and every other browser on WebKit, which iOS uses for all of them (CriOS, FxiOS). */
const isWebKit = (userAgent: string): boolean =>
  /AppleWebKit\//.test(userAgent) && !/(Chrome|Chromium)\//.test(userAgent);

/**
 * Whether the browser prints a PDF from a hidden frame. It needs a PDF viewer of its own
 * (`navigator.pdfViewerEnabled`): Chrome on Android and the browsers built on it have none and hand
 * the frame's PDF to the system instead, so no print dialog comes. Safari has one, but reports the
 * frame as loaded before the viewer has drawn the pages; printing right after a reload then gives
 * blank pages, and nothing tells when they are drawn.
 */
export const printsPdfInFrame = ({ pdfViewerEnabled, userAgent }: BrowserInfo): boolean =>
  pdfViewerEnabled === true && !isWebKit(userAgent);

/** Sharp on paper; a page larger than A3 is drawn coarser so the canvas stays within iOS's limit. */
const PRINT_DPI = 300;
const MAX_PIXELS = 16_000_000;

/** The scale from points to pixels a page of this size is drawn at. */
export const printScale = (width: number, height: number): number =>
  Math.min(PRINT_DPI / 72, Math.sqrt(MAX_PIXELS / (width * height)));

const canvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob"))), "image/png"),
  );

/** Draws every page of the PDF with pdf.js, which is loaded only when something is printed. */
export const renderPdfPages = async (bytes: Uint8Array): Promise<PrintPage[]> => {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdf.js takes the bytes over (they move to its worker); the caller keeps its own.
  const loading = pdfjs.getDocument({ data: bytes.slice() });
  try {
    const pdf = await loading.promise;
    const pages: PrintPage[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: printScale(width, height) });
      const canvas = Object.assign(document.createElement("canvas"), {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      });
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      pages.push({ image: await canvasBlob(canvas), width, height });
      // Frees the pixels at once; Safari keeps a canvas's memory until it is collected otherwise.
      canvas.width = 0;
      canvas.height = 0;
    }
    return pages;
  } finally {
    await loading.destroy();
  }
};

const PRINT_ID = "print-pages";

/**
 * While printing only the pages show, one per sheet, at the size of the first page; on screen they
 * never show.
 */
export const printStyle = ({ width, height }: Pick<PrintPage, "width" | "height">): string => `
@media screen { #${PRINT_ID} { display: none; } }
@media print {
  @page { size: ${width}pt ${height}pt; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  body > :not(#${PRINT_ID}) { display: none !important; }
  #${PRINT_ID} img { display: block; width: ${width}pt; height: ${height}pt; object-fit: contain; break-after: page; }
  #${PRINT_ID} img:last-child { break-after: auto; }
}`;

/** Takes away the pages of an earlier print, also where the browser never said it had finished. */
const removePrintPages = (doc: Document): void => {
  for (const element of doc.querySelectorAll(`#${PRINT_ID}, #${PRINT_ID}-style`)) {
    for (const image of element.querySelectorAll("img")) URL.revokeObjectURL(image.src);
    element.remove();
  }
};

/**
 * Prints the pages with the page's own print dialog: they go into the page, hidden on screen, and
 * the dialog opens once every picture is decoded, so the preview never shows a page still empty.
 */
export const printPages = async (
  win: Pick<Window, "document" | "print" | "addEventListener">,
  pages: PrintPage[],
): Promise<void> => {
  const doc = win.document;
  const [first] = pages;
  if (!first) return;
  removePrintPages(doc);
  const style = Object.assign(doc.createElement("style"), {
    id: `${PRINT_ID}-style`,
    textContent: printStyle(first),
  });
  const container = Object.assign(doc.createElement("div"), { id: PRINT_ID });
  const images = pages.map(({ image }) =>
    Object.assign(doc.createElement("img"), { src: URL.createObjectURL(image), alt: "" }),
  );
  container.append(...images);
  doc.head.append(style);
  doc.body.append(container);
  // A picture that cannot be decoded takes the pages away again: left behind, they would hold
  // their memory and be all a later print from the browser's menu shows.
  await Promise.all(images.map((image) => image.decode())).catch((error: unknown) => {
    removePrintPages(doc);
    throw error;
  });
  win.addEventListener("afterprint", () => removePrintPages(doc), { once: true });
  win.print();
};
