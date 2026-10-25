import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { type CellValue, cellXml, columnName } from "./xlsx";

/*
 * Appends rows below the last row of a sheet of an existing workbook (SpreadsheetML, ECMA-376
 * Part 1, 18.3.1). Cells are written as `xlsx` writes them: numbers, inline strings and formulas
 * without a cached value, which the engine calculates on open; the workbook's own styles are left
 * alone, so the cell styles of CellStyle do not apply here and plain values are written.
 */

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

const unescapeXml = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** "AB" → 27 (columns from 0). */
const columnIndex = (letters: string): number =>
  [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;

const partPath = (target: string): string => (target.startsWith("/") ? target.slice(1) : `xl/${target}`);

export type Appended = { bytes: Uint8Array; sheet: string; firstRow: number; lastRow: number };

/** The workbook with `rows` below the last row of `sheet` (by name; the first when absent). */
export const appendRows = (
  xlsx: Uint8Array,
  rows: CellValue[][],
  sheet?: string,
): { ok: true; value: Appended } | { ok: false; error: string } => {
  const files = unzipSync(xlsx);
  const part = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const sheets = [...part("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => ({
    name: unescapeXml(attribute(tag, "name") ?? ""),
    relationId: attribute(tag, "r:id"),
  }));
  const chosen = sheet === undefined ? sheets[0] : sheets.find((entry) => entry.name === sheet);
  if (!chosen) {
    return {
      ok: false,
      error: `Ein Blatt „${sheet ?? ""}“ gibt es nicht. Blätter: ${sheets.map((entry) => `„${entry.name}“`).join(", ")}.`,
    };
  }
  const relation = [...part("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => attribute(tag, "Id") === chosen.relationId);
  const path = partPath(attribute(relation ?? "", "Target") ?? "worksheets/sheet1.xml");
  const xml = part(path);
  if (!xml) return { ok: false, error: "Das Blatt fehlt in der Datei." };

  const last = Math.max(0, ...[...xml.matchAll(/<row\b[^>]*\sr="(\d+)"/g)].map((match) => Number(match[1])));
  const firstRow = last + 1;
  const added = rows
    .map(
      (cells, offset) =>
        `<row r="${firstRow + offset}">${cells
          .map((cell) => (typeof cell === "object" ? cell.value : cell))
          .map((value, column) => cellXml(value, `${columnName(column)}${firstRow + offset}`))
          .join("")}</row>`,
    )
    .join("");
  const lastRow = firstRow + rows.length - 1;
  const withRows = /<sheetData\s*\/>/.test(xml)
    ? xml.replace(/<sheetData\s*\/>/, `<sheetData>${added}</sheetData>`)
    : xml.replace("</sheetData>", `${added}</sheetData>`);
  // The used range, if the sheet states one (18.3.1.35), grows to take in the new rows.
  const width = Math.max(1, ...rows.map((cells) => cells.length));
  const updated = withRows.replace(
    /<dimension ref="([A-Z]+\d+)(?::([A-Z]+)\d+)?"\s*\/>/,
    (_, from: string, toColumn?: string) => {
      const right = columnName(Math.max(width - 1, toColumn ? columnIndex(toColumn) : 0));
      return `<dimension ref="${from}:${right}${Math.max(lastRow, 1)}"/>`;
    },
  );
  files[path] = strToU8(updated);
  return { ok: true, value: { bytes: zipSync(files), sheet: chosen.name, firstRow, lastRow } };
};
