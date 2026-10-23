import { escapeXml, officePackage, XML_HEADER } from "./zip";

/**
 * A cell: a number, a text, or a formula (with "=", e.g. "=SUM(A1:A3)"). Formulas are written
 * without a cached value; the engine calculates them on open.
 */
export type CellValue = number | string;

/**
 * One sheet: its name, its rows from row 1 down (each a list of cells from column A), and
 * optionally the widths of its first columns, in characters as Excel counts them.
 */
export type Sheet = { name: string; rows: CellValue[][]; widths?: number[] };

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** "A", "B", … "Z", "AA", … for a column index from 0. */
export const columnName = (index: number): string =>
  index < 26
    ? String.fromCharCode(65 + index)
    : columnName(Math.floor(index / 26) - 1) + columnName(index % 26);

/** A cell in SpreadsheetML (ECMA-376 Part 1, 18.3.1.4); texts as inline strings, no shared table. */
const cellXml = (value: CellValue, reference: string): string => {
  if (typeof value === "number") return `<c r="${reference}"><v>${value}</v></c>`;
  if (value.startsWith("=")) return `<c r="${reference}"><f>${escapeXml(value.slice(1))}</f></c>`;
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
};

/** Column widths (ECMA-376 Part 1, 18.3.1.13); `cols` must come before the cells. */
const colsXml = (widths: number[]): string =>
  widths.length === 0
    ? ""
    : `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`;

const sheetXml = ({ rows, widths = [] }: Sheet): string => `${XML_HEADER}
<worksheet xmlns="${MAIN}">
  ${colsXml(widths)}<sheetData>${rows
    .map(
      (cells, row) =>
        `<row r="${row + 1}">${cells.map((value, column) => cellXml(value, `${columnName(column)}${row + 1}`)).join("")}</row>`,
    )
    .join("")}</sheetData>
</worksheet>`;

/** Calibri 11, the defaults of a new workbook; the engine shows Calibri with its twin Carlito. */
const styles = `${XML_HEADER}
<styleSheet xmlns="${MAIN}">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** A workbook with the given sheets (ECMA-376 Part 1, 18.2). */
export const xlsx = (sheets: Sheet[]): Uint8Array => {
  const sheetParts = Object.fromEntries(
    sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)]),
  );
  return officePackage({
    "[Content_Types].xml": `${XML_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, index) => `  <Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
    "_rels/.rels": `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `${XML_HEADER}
<workbook xmlns="${MAIN}" xmlns:r="${REL}">
  <sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, index) => `  <Relationship Id="rId${index + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n")}
  <Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": styles,
    ...sheetParts,
  });
};

/** A new, empty workbook with one sheet, named as in German Excel. */
export const blankXlsx = (): Uint8Array => xlsx([{ name: "Tabelle1", rows: [] }]);
