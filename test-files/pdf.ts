/**
 * Writes small PDF files for the tests: A4 pages with lines of Helvetica text and, where asked,
 * fillable text fields. Hand-built after ISO 32000-1 (7.5 file structure, 9.6 standard fonts, 12.7
 * interactive forms), so the bytes and their license are ours and the same input gives the same file.
 */

export type PdfField = { name: string; x: number; y: number; width: number; height: number };
export type PdfPage = {
  /** Lines from the top of the page; the first is set as a heading. */
  lines: string[];
  fields?: PdfField[];
};

const A4 = { width: 595, height: 842 };
const LEFT = 72;
const TOP = 760;

/** Text for a literal string in WinAnsiEncoding: Latin-1 bytes, with "(", ")" and "\" escaped. */
const literal = (text: string): string => `(${text.replace(/[\\()]/g, (char) => `\\${char}`)})`;

const contentStream = (lines: string[]): string =>
  lines
    .map((line, index) => {
      const size = index === 0 ? 18 : 11;
      const y = TOP - (index === 0 ? 0 : 30 + index * 18);
      return `BT /F1 ${size} Tf ${LEFT} ${y} Td ${literal(line)} Tj ET`;
    })
    .join("\n");

/** Builds the objects in order and the cross-reference table that points to them. */
const serialize = (objects: string[]): Uint8Array => {
  let body = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1: one byte per character, as the literal strings are WinAnsi.
  return Uint8Array.from(body, (char) => char.charCodeAt(0));
};

/**
 * A PDF with the given pages. Object numbers: 1 catalog, 2 page tree, 3 font, then per page its
 * page object and content stream, then one object per text field (field and widget in one).
 */
export const pdf = (pages: PdfPage[]): Uint8Array => {
  const font = 3;
  const pageObject = (index: number) => 4 + index * 2;
  const fieldStart = 4 + pages.length * 2;
  const fields = pages.flatMap((page, pageIndex) =>
    (page.fields ?? []).map((field) => ({ field, pageIndex })),
  );
  const fieldRefs = fields.map((_, index) => `${fieldStart + index} 0 R`);

  const acroForm =
    fields.length > 0
      ? ` /AcroForm << /Fields [${fieldRefs.join(" ")}] /NeedAppearances true` +
        ` /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${font} 0 R >> >> >>`
      : "";
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R${acroForm} >>`,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((page, index) => {
    const annots = fields
      .map((entry, fieldIndex) => (entry.pageIndex === index ? fieldRefs[fieldIndex] : null))
      .filter(Boolean);
    const stream = contentStream(page.lines);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}]` +
        ` /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${pageObject(index) + 1} 0 R` +
        (annots.length > 0 ? ` /Annots [${annots.join(" ")}]` : "") +
        " >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  for (const { field, pageIndex } of fields) {
    const rect = [field.x, field.y, field.x + field.width, field.y + field.height].join(" ");
    objects.push(
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T ${literal(field.name)} /F 4 /Rect [${rect}]` +
        ` /P ${pageObject(pageIndex)} 0 R /DA (/Helv 11 Tf 0 g) /MK << /BC [0 0 0] >> >>`,
    );
  }
  return serialize(objects);
};
