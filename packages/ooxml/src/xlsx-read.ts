import { strFromU8, unzipSync } from "fflate";

/*
 * The values of a workbook's first sheet as text, the way the sheet shows them in German: what a
 * mail merge takes its recipients from. SpreadsheetML (ECMA-376 Part 1, 18): the sheet's cells
 * (18.3.1.4) hold numbers, shared strings (18.4), inline strings, booleans or cached formula
 * results; a number with a date format (18.8.30, built-in ids 14–22) is a date, counted in days
 * from 30 December 1899.
 */

const unescapeXml = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");

/** The text of a string item: its <t> elements, runs included, phonetic hints (<rPh>) left out. */
const textOf = (xml: string): string =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)]
    .map((match) => unescapeXml(match[1] ?? ""))
    .join("");

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Whether a number format shows a date: d or y outside quotes and brackets ([Red], [$-407]). */
const isDateFormat = (code: string): boolean => /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));

/** Which cell styles (by index in cellXfs) show their number as a date. */
const dateStyles = (styles: string): boolean[] => {
  const custom = new Map(
    [...styles.matchAll(/<numFmt\b[^>]*>/g)].map(([tag]) => [
      Number(attribute(tag, "numFmtId")),
      unescapeXml(attribute(tag, "formatCode") ?? ""),
    ]),
  );
  const cellXfs = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(styles)?.[0] ?? "";
  return [...cellXfs.matchAll(/<xf\b[^>]*>/g)].map(([tag]) => {
    const id = Number(attribute(tag, "numFmtId") ?? 0);
    return BUILT_IN_DATES.has(id) || isDateFormat(custom.get(id) ?? "");
  });
};

const germanNumber = (value: number): string => String(value).replace(".", ",");

/** Days since 30 December 1899 (Excel's 1900 date system with its leap-year gap) → "23.10.2026". */
const germanDate = (serial: number): string => {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
};

/** "AB12" → 27 (columns from 0). */
const columnOf = (reference: string): number =>
  [...(/^[A-Z]+/.exec(reference)?.[0] ?? "A")].reduce(
    (sum, letter) => sum * 26 + letter.charCodeAt(0) - 64,
    0,
  ) - 1;

const partPath = (target: string): string => (target.startsWith("/") ? target.slice(1) : `xl/${target}`);

/** The first sheet's values, row by row, as text; trailing empty rows and cells left out. */
export const xlsxRows = (xlsx: Uint8Array): string[][] => {
  const files = unzipSync(xlsx);
  const part = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const sheetTag = /<sheet\b[^>]*>/.exec(part("xl/workbook.xml"))?.[0] ?? "";
  const relationId = attribute(sheetTag, "r:id");
  const relation = [...part("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => attribute(tag, "Id") === relationId);
  const sheet = part(partPath(attribute(relation ?? "", "Target") ?? "worksheets/sheet1.xml"));
  const shared = [...part("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    textOf(match[1] ?? ""),
  );
  const dates = dateStyles(part("xl/styles.xml"));

  const rows: string[][] = [];
  for (const [, rowAttributes = "", rowXml = ""] of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(attribute(rowAttributes, "r") ?? rows.length + 1) - 1;
    const row: string[] = [];
    for (const [, cellAttributes = "", content = ""] of rowXml.matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const column = columnOf(attribute(cellAttributes, "r") ?? "");
      const type = attribute(cellAttributes, "t") ?? "n";
      const value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(content)?.[1] ?? "");
      const text =
        type === "s"
          ? (shared[Number(value)] ?? "")
          : type === "inlineStr"
            ? textOf(content)
            : type === "b"
              ? value === "1"
                ? "WAHR"
                : "FALSCH"
              : type === "n" && value !== ""
                ? dates[Number(attribute(cellAttributes, "s") ?? 0)]
                  ? germanDate(Number(value))
                  : germanNumber(Number(value))
                : value;
      row[column] = text;
    }
    rows[rowIndex] = Array.from(row, (value) => value ?? "");
  }
  const dense = Array.from(rows, (row) => row ?? []);
  while (dense.length > 0 && (dense.at(-1) ?? []).every((value) => value.trim() === "")) dense.pop();
  return dense.map((row) => {
    const trimmed = [...row];
    while (trimmed.length > 0 && (trimmed.at(-1) ?? "").trim() === "") trimmed.pop();
    return trimmed;
  });
};
