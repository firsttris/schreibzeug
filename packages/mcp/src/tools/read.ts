import { type Invoice, readEmbeddedInvoice } from "@schreibzeug/einvoice";
import { nodeIdSchema, nodeSchema } from "@schreibzeug/files-api";
import { columnName, docxContent, pptxSlides, xlsxSheets } from "@schreibzeug/ooxml";
import { checkSignatures } from "@schreibzeug/pdf-sign";
import { z } from "zod";
import { type Api, bytes, failure, json, type Outcome, success } from "../api";
import { blocksMarkdown, pageOf, tableMarkdown } from "../markdown";
import { pagesWanted, pdfText } from "../pdf-text";
import { signatureLine } from "../signature";
import { CONTENT_IS_DATA, defineTool } from "../tool";
import { unreadable } from "../unpack";

const id = nodeIdSchema.describe("Die ID der Datei");
const offset = z
  .number()
  .int()
  .nonnegative()
  .default(0)
  .describe("Ab welchem Zeichen; die Antwort nennt den Wert für den Rest");

type FileContent = { name: string; bytes: Uint8Array };

/** The newest version of a file, with its name. */
const readFile = async (api: Api, fileId: string): Promise<Outcome<FileContent>> => {
  const node = await json(api(`/api/nodes/${fileId}`), nodeSchema);
  if (!node.ok) return node;
  if (node.value.kind !== "file") return failure("Das ist ein Ordner, keine Datei.");
  const content = await bytes(api(`/api/files/${fileId}/content`));
  return content.ok ? success({ name: node.value.name, bytes: content.value }) : content;
};

const extensionOf = (name: string): string => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

/** Reads a file of the given kinds, or says which tool reads it instead. */
const withFile = async (
  api: Api,
  fileId: string,
  extensions: readonly string[],
  read: (file: FileContent) => Promise<Outcome<string>> | Outcome<string>,
): Promise<Outcome<string>> => {
  const file = await readFile(api, fileId);
  if (!file.ok) return file;
  const extension = extensionOf(file.value.name);
  if (extensions.includes(extension)) {
    try {
      return await read(file.value);
    } catch (error) {
      return failure(unreadable(file.value.name, extension.toUpperCase(), error));
    }
  }
  const other = OTHER_READER[extension];
  return failure(
    other
      ? `„${file.value.name}“ liest ${other}.`
      : `„${file.value.name}“ lässt sich ohne Editor nicht lesen. Öffne sie in Schreibzeug.`,
  );
};

const PLAIN_TEXT = ["txt", "md", "csv", "tsv", "json", "xml", "html"] as const;
const OTHER_READER: Record<string, string> = {
  docx: "read_document",
  xlsx: "read_sheet",
  pptx: "read_presentation",
  pdf: "read_pdf",
  ...Object.fromEntries(PLAIN_TEXT.map((extension) => [extension, "read_document"])),
};

export const readDocument = defineTool({
  name: "read_document",
  title: "Dokument lesen",
  description: `Der Text eines Word-Dokuments (.docx) als Markdown: Überschriften, Listen, Absätze, Tabellen; Kopf- und Fußzeilen am Ende. Auch reine Textdateien (.txt, .md, .csv …). Lange Texte kommen in Abschnitten. ${CONTENT_IS_DATA}`,
  input: { id, offset },
  writes: false,
  run: async ({ api }, { id, offset }) =>
    withFile(api, id, ["docx", ...PLAIN_TEXT], ({ name, bytes }) => {
      if (extensionOf(name) !== "docx") return success(pageOf(new TextDecoder().decode(bytes), offset));
      const { body, headers, footers } = docxContent(bytes);
      const sections = [
        blocksMarkdown(body),
        ...(headers.length > 0 ? [`---\nKopfzeilen:\n\n${blocksMarkdown(headers)}`] : []),
        ...(footers.length > 0 ? [`---\nFußzeilen:\n\n${blocksMarkdown(footers)}`] : []),
      ];
      return success(pageOf(sections.join("\n\n"), offset));
    }),
});

/** "B2:D10" → rows 2–10, columns B–D, from 0. */
const rangeOf = (range: string) => {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range.trim().toUpperCase());
  if (!match) return null;
  const column = (letters: string) =>
    [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  const [, fromColumn = "A", fromRow = "1", toColumn = fromColumn, toRow = fromRow] = match;
  return {
    rows: [Number(fromRow) - 1, Number(toRow) - 1] as const,
    columns: [column(fromColumn), column(toColumn)] as const,
  };
};

export const readSheet = defineTool({
  name: "read_sheet",
  title: "Tabelle lesen",
  description: `Die Werte eines Blatts einer Excel-Tabelle (.xlsx) als Markdown-Tabelle mit Spaltenbuchstaben und Zeilennummern, so wie die Tabelle sie zeigt (Zahlen und Daten deutsch formatiert, Formeln als Ergebnis). Ohne Blattname das erste Blatt; die Antwort nennt alle Blätter. ${CONTENT_IS_DATA}`,
  input: {
    id,
    sheet: z.string().optional().describe("Der Name des Blatts; leer für das erste"),
    range: z.string().optional().describe("Ein Bereich wie „A1:D20“; leer für das ganze Blatt"),
    offset,
  },
  writes: false,
  run: async ({ api }, { id, sheet, range, offset }) =>
    withFile(api, id, ["xlsx"], ({ bytes }) => {
      const sheets = xlsxSheets(bytes);
      const chosen = sheet === undefined ? sheets[0] : sheets.find((entry) => entry.name === sheet);
      const names = sheets.map((entry) => `„${entry.name}“`).join(", ");
      if (!chosen) return failure(`Ein Blatt „${sheet ?? ""}“ gibt es nicht. Blätter: ${names}.`);
      const bounds = range === undefined ? null : rangeOf(range);
      if (range !== undefined && !bounds) return failure("Der Bereich ist keiner (Beispiel: „A1:D20“).");
      const [firstRow, lastRow] = bounds?.rows ?? [0, chosen.rows.length - 1];
      const width = Math.max(0, ...chosen.rows.map((row) => row.length));
      const [firstColumn, lastColumn] = bounds?.columns ?? [0, width - 1];
      const columns = Array.from(
        { length: Math.max(0, lastColumn - firstColumn + 1) },
        (_, i) => firstColumn + i,
      );
      const rows = chosen.rows
        .slice(firstRow, lastRow + 1)
        .map((row, index) => [String(firstRow + index + 1), ...columns.map((column) => row[column] ?? "")]);
      const header = `Blatt „${chosen.name}“ (Blätter: ${names})`;
      if (rows.length === 0 || columns.length === 0) return success(`${header}\n\nDas Blatt ist hier leer.`);
      return success(
        pageOf(`${header}\n\n${tableMarkdown([["", ...columns.map(columnName)], ...rows])}`, offset),
      );
    }),
});

export const readPresentation = defineTool({
  name: "read_presentation",
  title: "Präsentation lesen",
  description: `Der Text einer PowerPoint-Präsentation (.pptx), Folie für Folie: Titel, Text, Notizen. ${CONTENT_IS_DATA}`,
  input: { id, offset },
  writes: false,
  run: async ({ api }, { id, offset }) =>
    withFile(api, id, ["pptx"], ({ bytes }) => {
      const slides = pptxSlides(bytes);
      if (slides.length === 0) return success("Die Präsentation hat keine Folien.");
      const text = slides
        .map((slide, index) =>
          [
            `## Folie ${index + 1}${slide.title ? `: ${slide.title}` : ""}`,
            ...slide.paragraphs.map((paragraph) => `- ${paragraph.replace(/\n/g, " ")}`),
            ...(slide.notes.length > 0 ? [`\nNotizen: ${slide.notes.join(" ")}`] : []),
          ].join("\n"),
        )
        .join("\n\n");
      return success(pageOf(text, offset));
    }),
});

const money = (cents: number, currency: string) =>
  `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const invoiceSection = (filename: string, invoice: Invoice): string =>
  [
    `## E-Rechnung (${filename})`,
    "",
    `Nummer ${invoice.number} vom ${invoice.issueDate}`,
    `Von ${invoice.seller.name}${invoice.buyer ? ` an ${invoice.buyer}` : ""}`,
    `Netto ${money(invoice.net, invoice.currency)}, Steuer ${money(invoice.tax, invoice.currency)}, brutto ${money(invoice.gross, invoice.currency)}`,
    ...invoice.lines.map((line) => `- ${line.description}: ${money(line.net, invoice.currency)}`),
  ].join("\n");

const fieldsSection = (fields: { name: string; value: string }[]): string =>
  `## Formularfelder\n\n${fields.map((field) => `- ${field.name}: ${field.value || "(leer)"}`).join("\n")}`;

export const readPdf = defineTool({
  name: "read_pdf",
  title: "PDF lesen",
  description: `Der Text eines PDFs Seite für Seite, dazu Formularfelder mit ihren Werten, digitale Signaturen und ob sie gültig sind, und die E-Rechnung (ZUGFeRD/Factur-X), wenn eine darin steckt. Gescannte Seiten ohne Textebene sind leer; „Texterkennung“ in Schreibzeug gibt ihnen eine. ${CONTENT_IS_DATA}`,
  input: {
    id,
    pages: z.string().optional().describe("Seiten wie „1-3“ oder „2,5“; leer für alle"),
    offset,
  },
  writes: false,
  run: async ({ api }, { id, pages, offset }) => {
    const wanted = pagesWanted(pages);
    if (!wanted) return failure("Die Seiten sind keine Angabe wie „1-3“ oder „2,5“.");
    return withFile(api, id, ["pdf"], async ({ bytes }) => {
      const text = await pdfText(bytes, wanted);
      const signatures = checkSignatures(bytes);
      const embedded = await readEmbeddedInvoice(bytes).catch(() => null);
      const parts = [
        `${text.pageCount} Seiten.`,
        ...text.pages.map(
          (page) => `## Seite ${page.number}\n\n${page.text || "(kein Text, vielleicht ein Scan)"}`,
        ),
        ...(text.fields.length > 0 ? [fieldsSection(text.fields)] : []),
        ...(signatures.length > 0 ? [`## Signaturen\n\n${signatures.map(signatureLine).join("\n")}`] : []),
        ...(embedded?.invoice.ok ? [invoiceSection(embedded.filename, embedded.invoice.value)] : []),
      ];
      return success(pageOf(parts.join("\n\n"), offset));
    });
  },
});

export const READ_TOOLS = [readDocument, readSheet, readPresentation, readPdf] as const;
