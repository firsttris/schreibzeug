import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { pptx, pptxSlides } from "../src";

const NOTES_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";

/** The package with a notes slide for slide 2, as PowerPoint writes one (19.3.1.26). */
const withNotes = (bytes: Uint8Array, notes: string): Uint8Array => {
  const files = unzipSync(bytes);
  const rels = strFromU8(files["ppt/slides/_rels/slide2.xml.rels"] ?? new Uint8Array());
  files["ppt/slides/_rels/slide2.xml.rels"] = strToU8(
    rels.replace(
      "</Relationships>",
      `<Relationship Id="rId9" Type="${NOTES_TYPE}" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
    ),
  );
  files["ppt/notesSlides/notesSlide1.xml"] = strToU8(
    `<p:notes xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${notes}</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum" idx="5"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>2</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree></p:cSld></p:notes>`,
  );
  return zipSync(files);
};

describe("pptxSlides", () => {
  it("reads title, text and notes of each slide, in order", () => {
    const bytes = pptx([
      { layout: "title", title: "Quartal & Plan", subtitle: "Oktober" },
      { layout: "content", title: "Ziele", bullets: ["Eins", "Zwei"] },
      { layout: "blank" },
    ]);
    expect(pptxSlides(withNotes(bytes, "Langsam sprechen &amp; lächeln"))).toEqual([
      { title: "Quartal & Plan", paragraphs: ["Oktober"], notes: [] },
      { title: "Ziele", paragraphs: ["Eins", "Zwei"], notes: ["Langsam sprechen & lächeln"] },
      { title: undefined, paragraphs: [], notes: [] },
    ]);
  });

  it("reads a presentation written by LibreOffice", () => {
    const slides = pptxSlides(
      new Uint8Array(readFileSync(join(import.meta.dirname, "../../../test-files/vortrag.pptx"))),
    );
    expect(slides.length).toBeGreaterThan(0);
    expect(slides[0]?.title).toBeTruthy();
  });

  it("answers no slides for something that is not a presentation", () => {
    expect(pptxSlides(zipSync({ "word/document.xml": strToU8("<w:document/>") }))).toEqual([]);
  });
});
