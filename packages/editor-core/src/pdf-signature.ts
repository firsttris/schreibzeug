import { type PdfColor, rgbOf } from "./pdf-color";
import type { PdfEngineApi, PdfWindow } from "./pdf-types";

/**
 * A signature as ink: the strokes drawn in the signature dialog become an ink annotation on the page
 * in view, built the way the engine's document builder builds one (sdkjs pdf/apiBuilder.js
 * Api.CreateInkAnnot: annotation props, solid border of the pen's width and colour, SetInkPoints).
 * An image stamp would hold a picture, but the engine throws on adding one (CPDFDoc.AddStampAnnot
 * reads the stamp render an image stamp lacks) and x2t's WebAssembly build stops on writing one.
 */

/** A stroke as drawn: points in the dialog's pixels, top left origin. */
export type Stroke = Array<{ x: number; y: number }>;

/** How wide a signature lands on the page, in points (about 6 cm); it can be moved and sized there. */
export const SIGNATURE_WIDTH = 170;

/** The pen of the signature, in points: a signature written with a fine pen. */
export const SIGNATURE_PEN = 1.2;

export type Box = { x1: number; y1: number; x2: number; y2: number };

/** The strokes' bounding box; null without points. */
export const boundsOf = (strokes: Stroke[]): Box | null => {
  const points = strokes.flat();
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

/**
 * Where the signature goes, in page points from the top left as the engine counts: in the middle
 * of the part of the page in view (CHtmlPage.getViewingRect, fractions of the page), at the
 * signature width or less on a narrow page, with the drawing's proportions.
 */
export const signaturePlace = (
  page: { width: number; height: number },
  view: { x: number; y: number; r: number; b: number },
  drawing: Box,
): Box => {
  const width = Math.min(SIGNATURE_WIDTH, page.width * 0.8);
  const drawnWidth = Math.max(drawing.x2 - drawing.x1, 1);
  const height = Math.max(width * ((drawing.y2 - drawing.y1) / drawnWidth), 2);
  const cx = page.width * ((view.x + view.r) / 2);
  const cy = page.height * ((view.y + view.b) / 2);
  return { x1: cx - width / 2, y1: cy - height / 2, x2: cx + width / 2, y2: cy + height / 2 };
};

/** The strokes moved and scaled into the place, as the engine's flat ink paths [x, y, x, y, …]. */
export const inkPaths = (strokes: Stroke[], drawing: Box, place: Box): number[][] => {
  const scale = (place.x2 - place.x1) / Math.max(drawing.x2 - drawing.x1, 1);
  return strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) =>
      stroke.flatMap(({ x, y }) => [
        place.x1 + (x - drawing.x1) * scale,
        place.y1 + (y - drawing.y1) * scale,
      ]),
    );
};

/** Puts the drawn signature as ink on the page in view, in one step of the history. */
export const addInkSignature = (
  win: PdfWindow,
  api: PdfEngineApi,
  strokes: Stroke[],
  color: PdfColor,
): void => {
  const drawing = boundsOf(strokes);
  if (!drawing) throw new Error("Die Unterschrift ist leer.");
  const doc = api.getPDFDoc();
  const viewer = doc.Viewer;
  const page = viewer.currentPage;
  const native = viewer.file.pages[page];
  if (!native) throw new Error("Keine Seite für die Unterschrift.");
  const place = signaturePlace({ width: native.W, height: native.H }, viewer.getViewingRect(page), drawing);
  const pen = SIGNATURE_PEN / 2;
  const now = Date.now();
  doc.DoAction(
    () => {
      const ink = doc.AddAnnotByProps({
        rect: [place.x1 - pen, place.y1 - pen, place.x2 + pen, place.y2 + pen],
        page,
        name: win.AscCommon.CreateGUID(),
        type: win.AscPDF.ANNOTATIONS_TYPES.Ink,
        author: api.User.asc_getUserName(),
        creationDate: now,
        modDate: now,
        hidden: false,
      });
      ink.SetBorderWidth(SIGNATURE_PEN);
      ink.SetBorderStyle(win.AscPDF.BORDER_TYPES.solid);
      ink.SetBorderColor(rgbOf(color).map((channel) => channel / 255));
      ink.SetInkPoints(inkPaths(strokes, drawing, place));
    },
    win.AscDFH.historydescription_Pdf_AddAnnot,
    doc,
  );
};
