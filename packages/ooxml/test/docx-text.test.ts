import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { blocksOf, docx, docxContent, headingStyles, paragraphXml, TEMPLATES } from "../src";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const cell = (text: string) => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;

describe("docx text", () => {
  it("marks headings by their style and list items by their level", () => {
    const styles = `<w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="Berschrift1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="Eigene"><w:name w:val="Meine Überschrift"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/></w:style>
      <w:style w:type="character" w:styleId="Fett"><w:name w:val="heading 4"/></w:style>
    </w:styles>`;
    const headings = headingStyles(styles);
    expect(headings).toEqual(
      new Map([
        ["Berschrift1", 1],
        ["Eigene", 3],
        ["Titel", 1],
      ]),
    );
    const paragraph = (properties: string, text: string) =>
      `<w:p><w:pPr>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const xml = `<w:body ${W}>
      ${paragraph('<w:pStyle w:val="Titel"/>', "Angebot")}
      ${paragraph('<w:pStyle w:val="Eigene"/>', "Leistungen")}
      ${paragraph('<w:pStyle w:val="Heading2"/>', "Ohne styles.xml")}
      ${paragraph('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>', "Punkt")}
      ${paragraph('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>', "Unterpunkt")}
      ${paragraph('<w:numPr><w:numId w:val="0"/></w:numPr>', "Keine Liste mehr")}
      ${paragraph("", "Text")}</w:body>`;
    expect(blocksOf(xml, headings)).toEqual([
      { type: "paragraph", text: "Angebot", heading: 1 },
      { type: "paragraph", text: "Leistungen", heading: 3 },
      { type: "paragraph", text: "Ohne styles.xml", heading: 2 },
      { type: "paragraph", text: "Punkt", list: 0 },
      { type: "paragraph", text: "Unterpunkt", list: 1 },
      { type: "paragraph", text: "Keine Liste mehr" },
      { type: "paragraph", text: "Text" },
    ]);
  });

  it("reads paragraphs with their runs, tabs, breaks and escaped characters", () => {
    const xml = `<w:body ${W}><w:p><w:r><w:t xml:space="preserve">Rechnung </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>A &amp; B</w:t></w:r></w:p>
      <w:p><w:r><w:t>eins</w:t><w:tab/><w:t>zwei</w:t><w:br/><w:t>drei</w:t></w:r></w:p><w:p/><w:p><w:pPr/></w:p></w:body>`;
    expect(blocksOf(xml)).toEqual([
      { type: "paragraph", text: "Rechnung A & B" },
      { type: "paragraph", text: "eins\tzwei\ndrei" },
      { type: "paragraph", text: "" },
      { type: "paragraph", text: "" },
    ]);
  });

  it("reads tables row by row, a cell's paragraphs as lines", () => {
    const xml = `<w:body ${W}><w:tbl><w:tblPr/><w:tr>${cell("Pos.")}${cell("Beschreibung")}</w:tr>
      <w:tr>${cell("1")}<w:tc><w:p><w:r><w:t>Beratung</w:t></w:r></w:p><w:p><w:r><w:t>vor Ort</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>danach</w:t></w:r></w:p></w:body>`;
    expect(blocksOf(xml)).toEqual([
      {
        type: "table",
        rows: [
          ["Pos.", "Beschreibung"],
          ["1", "Beratung\nvor Ort"],
        ],
      },
      { type: "paragraph", text: "danach" },
    ]);
  });

  it("puts a table inside a cell into that cell's lines", () => {
    const inner = `<w:tbl><w:tr>${cell("a")}${cell("b")}</w:tr></w:tbl>`;
    const xml = `<w:body ${W}><w:tbl><w:tr><w:tc>${inner}<w:p/></w:tc></w:tr></w:tbl></w:body>`;
    expect(blocksOf(xml)).toEqual([{ type: "table", rows: [["a\tb\n"]] }]);
  });

  it("leaves out deleted text and field codes", () => {
    const xml = `<w:body ${W}><w:p><w:del><w:r><w:delText>alt</w:delText></w:r></w:del><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:t>neu</w:t></w:r></w:p></w:body>`;
    expect(blocksOf(xml)).toEqual([{ type: "paragraph", text: "neu" }]);
  });

  it("reads a package with its headers and footers", () => {
    const part = (body: string) => `<w:hdr ${W}>${body}</w:hdr>`;
    const bytes = zipSync({
      "word/document.xml": strToU8(
        `<w:document ${W}><w:body>${paragraphXml([{ text: "Text" }])}</w:body></w:document>`,
      ),
      "word/header1.xml": strToU8(part(paragraphXml([{ text: "Kopf" }]))),
      "word/footer1.xml": strToU8(part(paragraphXml([{ text: "IBAN DE02 1203 0000 0000 2020 51" }]))),
    });
    expect(docxContent(bytes)).toEqual({
      body: [{ type: "paragraph", text: "Text" }],
      headers: [{ type: "paragraph", text: "Kopf" }],
      footers: [{ type: "paragraph", text: "IBAN DE02 1203 0000 0000 2020 51" }],
    });
  });

  it("reads the documents the package writes, the invoice template among them", () => {
    expect(docxContent(docx([paragraphXml([{ text: "Hallo" }])])).body).toEqual([
      { type: "paragraph", text: "Hallo" },
    ]);
    const invoice = TEMPLATES.find((template) => template.id === "rechnung");
    if (!invoice) throw new Error("no invoice template");
    const { body } = docxContent(invoice.bytes());
    expect(body).toContainEqual({ type: "paragraph", text: "Rechnung" });
    expect(body).toContainEqual({
      type: "table",
      rows: [
        ["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"],
        ["1", "[Leistung]", "1", "0,00 €", "0,00 €"],
        ["2", "[Leistung]", "1", "0,00 €", "0,00 €"],
      ],
    });
  });
});
