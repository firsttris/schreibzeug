import { escapeXml, officePackage } from "./zip";

/** One run of text with optional run properties, e.g. `<w:i/>` (ECMA-376 Part 1, 17.3.2). */
export type Run = { text: string; properties?: string };

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * The defaults of a new Word document (Calibri 11 pt, 8 pt after a paragraph, 1.08 lines), in
 * German. Without them a document falls back to Times New Roman; the engine shows Calibri with
 * its metric twin Carlito, which it ships.
 */
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-DE" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;

/** A4 with the margins Word uses for German documents (twentieths of a point). */
const sectionProperties =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

const runXml = ({ text, properties }: Run): string =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

/**
 * A paragraph from runs, with optional paragraph properties, e.g. `<w:jc w:val="center"/>`
 * (ECMA-376 Part 1, 17.3.1); a paragraph without runs is an empty line.
 */
export const paragraphXml = (runs: Run[], properties?: string): string =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs.map(runXml).join("")}</w:p>`;

const documentXml = (paragraphs: string[]): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join("\n    ")}
    ${sectionProperties}
  </w:body>
</w:document>`;

/** A .docx package with the given paragraphs (as built by `paragraphXml`). */
export const docx = (paragraphs: string[]): Uint8Array =>
  officePackage({
    "[Content_Types].xml": contentTypes,
    "_rels/.rels": rootRels,
    "word/document.xml": documentXml(paragraphs),
    "word/_rels/document.xml.rels": documentRels,
    "word/styles.xml": styles,
  });

/** A new, empty Word document: one empty paragraph, so the cursor has somewhere to go. */
export const blankDocx = (): Uint8Array => docx([paragraphXml([])]);
