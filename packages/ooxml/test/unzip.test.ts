import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docx, docxContent, paragraphXml, pptxSlides, xlsxSheets } from "../src";
import { boundedUnzip, isArchiveTooLarge, MAX_UNZIPPED_BYTES } from "../src/unzip";

/** A zip of `parts`, with the central directory's declared size of each entry set by `declare`. */
const declaring = (parts: Record<string, Uint8Array>, declare: (name: string) => number): Uint8Array => {
  const zip = zipSync(parts);
  const view = new DataView(zip.buffer);
  for (let at = 0; at + 46 <= zip.length; at += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) continue;
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + view.getUint16(at + 28, true)));
    view.setUint32(at + 24, declare(name), true);
  }
  return zip;
};

const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
};

const zeros = (length: number) => new Uint8Array(length);

describe("boundedUnzip", () => {
  it("gives what unzipSync gives for an ordinary package", () => {
    const bytes = docx([paragraphXml([{ text: "Hallo" }])]);
    expect(boundedUnzip(bytes)).toEqual(unzipSync(bytes));
    expect(Object.keys(boundedUnzip(bytes, (name) => name.startsWith("word/")))).toEqual(
      Object.keys(unzipSync(bytes, { filter: (file) => file.name.startsWith("word/") })),
    );
  });

  it("refuses before inflating when an entry declares more than the budget", () => {
    const bomb = declaring({ "word/document.xml": zeros(1024) }, () => MAX_UNZIPPED_BYTES + 1);
    expect(isArchiveTooLarge(caught(() => boundedUnzip(bomb)))).toBe(true);
  });

  it("refuses entries that only together declare more than the budget", () => {
    const half = Math.floor(MAX_UNZIPPED_BYTES / 2) + 1;
    const bomb = declaring({ "a.xml": zeros(10), "b.xml": zeros(10) }, () => half);
    expect(isArchiveTooLarge(caught(() => boundedUnzip(bomb)))).toBe(true);
    // An entry left out does not count.
    expect(Object.keys(boundedUnzip(bomb, (name) => name === "a.xml"))).toEqual(["a.xml"]);
  });

  it("stops an entry that inflates past the size it declared", () => {
    const liar = declaring({ "word/document.xml": zeros(4 * 1024 * 1024) }, () => 100);
    const error = caught(() => boundedUnzip(liar));
    expect(error).toBeInstanceOf(Error);
    expect(isArchiveTooLarge(error)).toBe(false);
  });

  it("throws on what is no zip, like unzipSync", () => {
    expect(caught(() => boundedUnzip(new TextEncoder().encode("kein zip")))).toBeInstanceOf(Error);
  });

  it("guards every reader", () => {
    const bomb = (name: string) => declaring({ [name]: zeros(1024) }, () => MAX_UNZIPPED_BYTES + 1);
    expect(isArchiveTooLarge(caught(() => docxContent(bomb("word/document.xml"))))).toBe(true);
    expect(isArchiveTooLarge(caught(() => xlsxSheets(bomb("xl/workbook.xml"))))).toBe(true);
    expect(isArchiveTooLarge(caught(() => pptxSlides(bomb("ppt/presentation.xml"))))).toBe(true);
  });
});
