import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { blankDocx, docx, paragraphXml } from "../src";

const documentOf = (bytes: Uint8Array): string => {
  const part = unzipSync(bytes)["word/document.xml"];
  if (!part) throw new Error("word/document.xml missing");
  return strFromU8(part);
};

describe("docx", () => {
  it("writes the parts a word processor needs", () => {
    expect(Object.keys(unzipSync(blankDocx())).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
    ]);
  });

  it("sets the defaults of a new Word document: Calibri 11 pt, German", () => {
    const part = unzipSync(blankDocx())["word/styles.xml"];
    const styles = part ? strFromU8(part) : "";
    expect(styles).toContain('<w:rFonts w:ascii="Calibri"');
    expect(styles).toContain('<w:sz w:val="22"/>');
    expect(styles).toContain('<w:lang w:val="de-DE"');
  });

  it("keeps runs and their properties", () => {
    const xml = documentOf(docx([paragraphXml([{ text: "kursiv", properties: "<w:i/>" }])]));
    expect(xml).toContain('<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">kursiv</w:t></w:r>');
  });

  it("keeps paragraph properties", () => {
    const xml = documentOf(docx([paragraphXml([{ text: "Mitte" }], '<w:jc w:val="center"/>')]));
    expect(xml).toContain('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>');
  });

  it("escapes text so it cannot break the XML", () => {
    const xml = documentOf(docx([paragraphXml([{ text: 'a < b & "c"' }])]));
    expect(xml).toContain("a &lt; b &amp; &quot;c&quot;");
  });

  it("gives the same bytes for the same content", () => {
    expect(blankDocx()).toEqual(blankDocx());
  });

  it("gives a blank document one empty paragraph on an A4 page", () => {
    const xml = documentOf(blankDocx());
    expect(xml).toContain("<w:p></w:p>");
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
  });
});
