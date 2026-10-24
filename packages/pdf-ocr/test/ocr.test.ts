import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, rgb, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { addTextLayer, type RecognizedPage, textlessPages } from "../src";

const A4 = [595, 842] as const;

/** A page drawn like a scan: shapes, no text. */
const drawScan = (document: PDFDocument) => {
  const page = document.addPage([...A4]);
  page.drawRectangle({ x: 72, y: 700, width: 300, height: 20, color: rgb(0, 0, 0) });
  return page;
};

const makePdf = async (build: (document: PDFDocument) => Promise<void> | void) => {
  const document = await PDFDocument.create();
  await build(document);
  return document.save();
};

/** The page's content streams, decoded, as one text. */
const pageContent = async (pdf: Uint8Array, index: number) => {
  const document = await PDFDocument.load(pdf);
  const contents = document.getPage(index).node.Contents();
  const streams =
    contents instanceof PDFArray ? contents.asArray().map((ref) => document.context.lookup(ref)) : [contents];
  return streams
    .map((stream) =>
      stream instanceof PDFRawStream
        ? new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode())
        : "",
    )
    .join("\n");
};

/** "Hallo Welt" on one line, recognised on a 1190 × 1684 image of an A4 page (2 pixels per point). */
const hallo: RecognizedPage = {
  page: 0,
  image: { width: 1190, height: 1684 },
  lines: [
    [
      { text: "Hallo", box: { x0: 144, y0: 200, x1: 264, y1: 240 } },
      { text: "Welt", box: { x0: 280, y0: 200, x1: 380, y1: 240 } },
    ],
  ],
};

describe("textlessPages", () => {
  it("finds the pages that only show shapes or images", async () => {
    const pdf = await makePdf(async (document) => {
      const font = await document.embedFont(StandardFonts.Helvetica);
      drawScan(document);
      document.addPage([...A4]).drawText("Text", { x: 72, y: 700, font, size: 12 });
      drawScan(document);
    });
    expect(await textlessPages(pdf)).toEqual({ count: 3, textless: [0, 2] });
  });

  it("counts text a page draws through a form XObject", async () => {
    const pdf = await makePdf(async (document) => {
      const source = await PDFDocument.create();
      const sourceFont = await source.embedFont(StandardFonts.Helvetica);
      source.addPage([...A4]).drawText("Im Formular", { x: 72, y: 700, font: sourceFont, size: 12 });
      const [form] = await document.embedPdf(await source.save());
      if (!form) throw new Error("no page embedded");
      document.addPage([...A4]).drawPage(form);
    });
    expect((await textlessPages(pdf)).textless).toEqual([]);
  });
});

describe("addTextLayer", () => {
  it("lays the words over the page, invisible, where they are on the image", async () => {
    const pdf = await makePdf((document) => void drawScan(document));
    const layered = await addTextLayer(pdf, [hallo]);
    const content = await pageContent(layered, 0);

    expect(content).toContain("3 Tr");
    // The image has 2 pixels per point: "Hallo" starts at x 72 and its box ends 120 points down.
    expect(content).toMatch(/1 0 0 1 72 722 Tm/);
    expect(content).toMatch(/1 0 0 1 140 722 Tm/);
    // The words are Helvetica in WinAnsi, a space after the first.
    expect(content).toContain(`<${Buffer.from("Hallo ").toString("hex").toUpperCase()}> Tj`);
    expect(content).toContain(`<${Buffer.from("Welt").toString("hex").toUpperCase()}> Tj`);
    // Afterwards the page has text: it is searchable, and a second run leaves it alone.
    expect((await textlessPages(layered)).textless).toEqual([]);
  });

  it("stretches each word to the width of its letters on the image", async () => {
    const pdf = await makePdf((document) => void drawScan(document));
    const content = await pageContent(await addTextLayer(pdf, [hallo]), 0);
    const helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    // "Hallo": 60 points wide on the page, set 20 points high.
    const squeeze = (100 * 60) / helvetica.widthOfTextAtSize("Hallo", 20);
    const written = Number(/([\d.]+) Tz/.exec(content)?.[1]);
    expect(written).toBeCloseTo(squeeze, 3);
  });

  it("measures from what the page shows, its crop box", async () => {
    const pdf = await makePdf((document) => {
      const page = drawScan(document);
      page.setCropBox(100, 50, 400, 600);
    });
    const recognized: RecognizedPage = {
      page: 0,
      image: { width: 800, height: 1200 },
      lines: [[{ text: "Rand", box: { x0: 0, y0: 0, x1: 100, y1: 40 } }]],
    };
    const content = await pageContent(await addTextLayer(pdf, [recognized]), 0);
    // Top left of the image is the crop box's top left: x 100, y 50 + 600; the box's foot 20 lower.
    expect(content).toMatch(/1 0 0 1 100 630 Tm/);
  });

  it("writes characters Helvetica cannot show as question marks", async () => {
    const pdf = await makePdf((document) => void drawScan(document));
    const recognized: RecognizedPage = {
      ...hallo,
      lines: [[{ text: "Größe→", box: { x0: 144, y0: 200, x1: 264, y1: 240 } }]],
    };
    const content = await pageContent(await addTextLayer(pdf, [recognized]), 0);
    // WinAnsi: G r ö (F6) ß (DF) e, and ? for the arrow.
    expect(content).toContain("<4772F6DF653F> Tj");
  });

  it("skips empty words and pages that are not there", async () => {
    const pdf = await makePdf((document) => void drawScan(document));
    const layered = await addTextLayer(pdf, [
      {
        ...hallo,
        lines: [[{ text: "  ", box: hallo.lines[0]?.[0]?.box ?? { x0: 0, y0: 0, x1: 1, y1: 1 } }]],
      },
      { ...hallo, page: 5 },
    ]);
    expect(await pageContent(layered, 0)).not.toContain("Tj");
  });
});
