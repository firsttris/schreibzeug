import { strToU8, zipSync } from "fflate";

/** One run of text with optional run properties, e.g. `<w:i/>` (ECMA-376 Part 1, 17.3.2). */
export type Run = { text: string; properties?: string };

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** A4 with the margins Word uses for German documents (twentieths of a point). */
const sectionProperties =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const runXml = ({ text, properties }: Run): string =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

/** A paragraph from runs; a paragraph without runs is an empty line. */
export const paragraphXml = (runs: Run[]): string => `<w:p>${runs.map(runXml).join("")}</w:p>`;

const documentXml = (paragraphs: string[]): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join("\n    ")}
    ${sectionProperties}
  </w:body>
</w:document>`;

/** A .docx package with the given paragraphs (as built by `paragraphXml`). */
export const docx = (paragraphs: string[]): Uint8Array =>
  zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "word/document.xml": strToU8(documentXml(paragraphs)),
  });

/** A new, empty Word document: one empty paragraph, so the cursor has somewhere to go. */
export const blankDocx = (): Uint8Array => docx([paragraphXml([])]);
