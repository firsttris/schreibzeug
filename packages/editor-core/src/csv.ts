/**
 * CSV files in the spreadsheet editor. x2t reads them into an .xlsx (engine frame x2t/worker.js),
 * told the delimiter; they are written here, from the values the sheet shows (cell.ts sheetText),
 * because x2t's writer loses every character past ASCII in its WebAssembly build. The delimiter
 * is the one the file uses, so a file saved again reads as before in the program it came from;
 * German Excel writes ";".
 */

export type CsvDelimiter = "semicolon" | "comma" | "tab";

/** common/commonDefines.js c_oAscCsvDelimiter, as x2t takes it (m_nCsvDelimiter). */
export const CSV_DELIMITER_CODES: Record<CsvDelimiter, number> = { tab: 1, semicolon: 2, comma: 4 };

const CSV_DELIMITER_CHARACTERS: Record<CsvDelimiter, string> = { semicolon: ";", comma: ",", tab: "\t" };

/** How often each delimiter appears in a line, quoted parts left out. */
const countOutsideQuotes = (line: string): Record<CsvDelimiter, number> => {
  const counts: Record<CsvDelimiter, number> = { semicolon: 0, comma: 0, tab: 0 };
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (!quoted) {
      for (const delimiter of Object.keys(CSV_DELIMITER_CHARACTERS) as CsvDelimiter[]) {
        if (character === CSV_DELIMITER_CHARACTERS[delimiter]) counts[delimiter] += 1;
      }
    }
  }
  return counts;
};

/** How many lines are looked at to tell the delimiter. */
const SAMPLE_LINES = 20;

/**
 * The delimiter the most lines of the start of the file use, preferring ";" on a tie (and for a
 * file of one column), as German Excel does.
 */
export const detectDelimiter = (bytes: Uint8Array): CsvDelimiter => {
  const text = new TextDecoder().decode(bytes.subarray(0, 64 * 1024)).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, SAMPLE_LINES);
  const totals: Record<CsvDelimiter, number> = { semicolon: 0, comma: 0, tab: 0 };
  for (const line of lines) {
    const counts = countOutsideQuotes(line);
    for (const delimiter of Object.keys(totals) as CsvDelimiter[]) totals[delimiter] += counts[delimiter];
  }
  const order: CsvDelimiter[] = ["semicolon", "tab", "comma"];
  return order.reduce(
    (best, delimiter) => (totals[delimiter] > totals[best] ? delimiter : best),
    "semicolon",
  );
};

/** A field in quotes where it holds the delimiter, a quote or a line break; quotes doubled. */
const field = (value: string, delimiter: string): string =>
  value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/**
 * Rows of values as a CSV file: UTF-8 with a byte order mark, which Excel needs to read it as
 * UTF-8, and lines ended by CR LF, as Excel writes them.
 */
export const encodeCsv = (rows: readonly (readonly string[])[], delimiter: CsvDelimiter): Uint8Array => {
  const character = CSV_DELIMITER_CHARACTERS[delimiter];
  const lines = rows.map((row) => row.map((value) => field(value, character)).join(character));
  return new TextEncoder().encode(`\uFEFF${lines.map((line) => `${line}\r\n`).join("")}`);
};
