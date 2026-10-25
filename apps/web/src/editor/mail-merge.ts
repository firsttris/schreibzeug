import { type Convert, decodeCsv } from "@schreibzeug/editor-core";
import { xlsxRows } from "@schreibzeug/ooxml";
import { extensionOf } from "../lib/format";

/** The recipients of a mail merge: where they come from, and their table (first row the field names). */
export type Recipients = { source: string; rows: string[][] };

/** Tables a mail merge can take its recipients from. */
export const RECIPIENT_EXTENSIONS = ["xlsx", "ods", "xls", "csv"] as const;

export const isRecipientTable = (name: string): boolean =>
  (RECIPIENT_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/**
 * The table in a file: a CSV read here, an .xlsx read here (its first sheet), an .ods or .xls
 * turned into an .xlsx by x2t first.
 */
export const tableOf = async (name: string, bytes: Uint8Array, convert: Convert): Promise<string[][]> => {
  const extension = extensionOf(name);
  if (extension === "csv") return decodeCsv(bytes);
  if (extension === "xlsx") return xlsxRows(bytes);
  if (extension === "ods" || extension === "xls")
    return xlsxRows((await convert(bytes, extension, "xlsx")).bytes);
  throw new Error("Empfänger kommen aus einer Tabelle (.xlsx, .ods, .xls oder .csv).");
};

export type RecipientCheck = { ok: true; recipients: Recipients } | { ok: false; error: string };

/**
 * The table as recipients: rows of the width of its header, empty rows left out. A table needs a
 * header and at least one recipient; a column without a name cannot become a field.
 */
export const recipientsOf = (source: string, table: string[][]): RecipientCheck => {
  const [header = [], ...rest] = table;
  const names = header.map((name) => name.trim());
  if (names.length === 0 || names.every((name) => name === "")) {
    return {
      ok: false,
      error: "Die erste Zeile der Tabelle braucht die Namen der Felder, z. B. „Name“ und „Ort“.",
    };
  }
  const width = names.length;
  const rows = rest
    .map((row) => Array.from({ length: width }, (_, index) => (row[index] ?? "").trim()))
    .filter((row) => row.some((value) => value !== ""));
  if (rows.length === 0)
    return { ok: false, error: "Die Tabelle hat unter der ersten Zeile keine Empfänger." };
  const unnamed = names.indexOf("");
  if (unnamed >= 0)
    return { ok: false, error: `Spalte ${unnamed + 1} hat in der ersten Zeile keinen Namen.` };
  return { ok: true, recipients: { source, rows: [names, ...rows] } };
};

/** Fields the document uses that the recipients do not have: they would stay «Name» in every letter. */
export const missingFields = (inDocument: string[], recipients: Recipients): string[] => {
  const names = new Set(recipients.rows[0] ?? []);
  return inDocument.filter((name) => !names.has(name));
};

/** "Einladung.docx" → "Einladung – Serienbrief.docx". */
export const mergedNameFor = (name: string): string => `${name.replace(/\.[^.]*$/, "")} – Serienbrief.docx`;
