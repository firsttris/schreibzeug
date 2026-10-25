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

/** How many lines are looked at to tell the delimiter. */
const SAMPLE_LINES = 20;

/**
 * How often each delimiter appears in the first non-empty lines, quoted parts left out. The quote
 * state carries over line breaks, since a quoted field may hold one (RFC 4180), so a delimiter on
 * the second line of such a field is not counted.
 */
const countOutsideQuotes = (text: string, lines: number): Record<CsvDelimiter, number> => {
  const counts: Record<CsvDelimiter, number> = { semicolon: 0, comma: 0, tab: 0 };
  let quoted = false;
  let inLine = false;
  let seen = 0;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "\n") {
      if (inLine) seen += 1;
      if (seen >= lines) break;
      inLine = false;
      continue;
    }
    if (character !== "\r") inLine = true;
    if (quoted) continue;
    for (const delimiter of Object.keys(CSV_DELIMITER_CHARACTERS) as CsvDelimiter[]) {
      if (character === CSV_DELIMITER_CHARACTERS[delimiter]) counts[delimiter] += 1;
    }
  }
  return counts;
};

/**
 * The delimiter the start of the file uses most, preferring ";" on a tie (and for a file of one
 * column), as German Excel does.
 */
export const detectDelimiter = (bytes: Uint8Array): CsvDelimiter => {
  const text = new TextDecoder().decode(bytes.subarray(0, 64 * 1024)).replace(/^\uFEFF/, "");
  const totals = countOutsideQuotes(text, SAMPLE_LINES);
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

/**
 * The text of a CSV file: UTF-8 (with or without a byte order mark), else Windows-1252, as German
 * Excel writes "CSV (Trennzeichen-getrennt)".
 */
const csvText = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

/** A CSV file as rows of values (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes). */
export const decodeCsv = (bytes: Uint8Array): string[][] => {
  const delimiter = CSV_DELIMITER_CHARACTERS[detectDelimiter(bytes)];
  const text = csvText(bytes);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      rows.push([...row, value]);
      row = [];
      value = "";
    } else value += character;
  }
  if (value !== "" || row.length > 0) rows.push([...row, value]);
  return rows;
};
