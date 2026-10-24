import type { Block } from "tesseract.js";
import { describe, expect, it } from "vitest";
import { linesOf, makeSearchable } from "./ocr";

const word = (text: string, x0: number) => ({ text, bbox: { x0, y0: 10, x1: x0 + 40, y1: 30 } });
const block = (lines: Array<Array<ReturnType<typeof word>>>) =>
  ({ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }) as unknown as Block;

describe("linesOf", () => {
  it("keeps the lines and the words with their boxes", () => {
    expect(linesOf([block([[word("Hallo", 0), word("Welt", 50)]]), block([[word("Zwei", 0)]])])).toEqual([
      [
        { text: "Hallo", box: { x0: 0, y0: 10, x1: 40, y1: 30 } },
        { text: "Welt", box: { x0: 50, y0: 10, x1: 90, y1: 30 } },
      ],
      [{ text: "Zwei", box: { x0: 0, y0: 10, x1: 40, y1: 30 } }],
    ]);
  });

  it("drops empty words and lines, and a page without blocks", () => {
    expect(linesOf([block([[word(" ", 0)], [word("Da", 0)]])])).toEqual([
      [{ text: "Da", box: { x0: 0, y0: 10, x1: 40, y1: 30 } }],
    ]);
    expect(linesOf(null)).toEqual([]);
  });
});

describe("makeSearchable", () => {
  const canvas = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement;
  const line = [{ text: "Gescannt", box: { x0: 10, y0: 10, x1: 90, y1: 30 } }];

  /** A PDF of a scanned page, a page with text, and a second scan. */
  const pdfWithScans = async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage([200, 200]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    document.addPage([200, 200]).drawText("Text", { x: 10, y: 10, font, size: 12 });
    document.addPage([200, 200]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    return document.save();
  };

  it("recognises only the pages without text and lays the text over them", async () => {
    const rendered: number[] = [];
    const steps: unknown[] = [];
    let closed = false;
    const result = await makeSearchable({
      pdf: await pdfWithScans(),
      render: (page) => {
        rendered.push(page);
        return canvas(400, 400);
      },
      recognizer: async (onProgress) => ({
        recognize: async () => {
          onProgress(1);
          return [line];
        },
        close: async () => {
          closed = true;
        },
      }),
      onStep: (step) => steps.push(step),
    });
    expect(rendered).toEqual([0, 2]);
    expect(closed).toBe(true);
    expect(steps).toEqual([
      { page: 1, of: 2, fraction: 0 },
      { page: 1, of: 2, fraction: 1 },
      { page: 2, of: 2, fraction: 0 },
      { page: 2, of: 2, fraction: 1 },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.pages).toBe(2);
    const { textlessPages } = await import("@schreibzeug/pdf-ocr");
    expect((await textlessPages(result.pdf)).textless).toEqual([]);
  });

  it("says so when every page has text, or nothing was recognised", async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const document = await PDFDocument.create();
    document.addPage().drawText("Text", { font: await document.embedFont(StandardFonts.Helvetica) });
    const recognizer = async () => ({ recognize: async () => [], close: async () => {} });
    const base = { render: () => canvas(10, 10), recognizer, onStep: () => {} };
    expect(await makeSearchable({ ...base, pdf: await document.save() })).toEqual({
      ok: false,
      error: "Jede Seite des PDFs enthält schon Text.",
    });
    expect(await makeSearchable({ ...base, pdf: await pdfWithScans() })).toEqual({
      ok: false,
      error: "Auf den Seiten ohne Text wurde kein Text erkannt.",
    });
  });
});
