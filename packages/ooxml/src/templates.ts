/**
 * The templates "Neu aus Vorlage" offers: a letter, an offer and an invoice, a calculation and a
 * project plan, a presentation. They are written here, so their text and layout are ours; square
 * brackets mark what to fill in. The invoice carries what §14 UStG asks of one.
 */
import { docx, paragraphXml, type Run } from "./docx";
import { pptx } from "./pptx";
import { type CellValue, xlsx } from "./xlsx";

export type TemplateFormat = "docx" | "xlsx" | "pptx";

export type Template = {
  id: string;
  /** The name the new file gets, without the extension. */
  name: string;
  format: TemplateFormat;
  description: string;
  bytes: () => Uint8Array;
};

// --- Word: run and paragraph properties (ECMA-376 Part 1, 17.3) --------------------------------

const bold = "<w:b/>";
const size = (points: number) => `<w:sz w:val="${points * 2}"/><w:szCs w:val="${points * 2}"/>`;
const grey = '<w:color w:val="595959"/>';
const after = (points: number) => `<w:spacing w:before="0" w:after="${points * 20}"/>`;
const right = '<w:jc w:val="right"/>';

const text = (content: string, paragraph = after(8), run?: string) =>
  paragraphXml([{ text: content, ...(run ? { properties: run } : {}) } satisfies Run], paragraph);
const heading = (content: string, points = 20) => text(content, after(6), `${bold}${size(points)}`);
const empty = (points = 8) => paragraphXml([], after(points));

/** The width of the text on A4 with the margins of docx.ts: 21 cm less 2 × 2.5 cm, in twips. */
const TEXT_WIDTH = 9072;

type TableCell = { text: string; bold?: boolean; right?: boolean };

const cellXml = (cell: TableCell, width: number) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraphXml(
    [{ text: cell.text, ...(cell.bold ? { properties: bold } : {}) }],
    `${after(0)}${cell.right ? right : ""}`,
  )}</w:tc>`;

const BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"';

/** A table across the text width with thin grey lines (17.4); `widths` are shares of it. */
const table = (widths: number[], rows: TableCell[][]): string => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const twips = widths.map((width) => Math.round((width / total) * TEXT_WIDTH));
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} ${BORDER}/>`)
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${twips
    .map((width) => `<w:gridCol w:w="${width}"/>`)
    .join("")}</w:tblGrid>${rows
    .map((row) => `<w:tr>${row.map((cell, index) => cellXml(cell, twips[index] ?? 0)).join("")}</w:tr>`)
    .join("")}</w:tbl>`;
};

const itemRows = (header: string[], rows: string[][]): TableCell[][] => [
  header.map((label, index) => ({ text: label, bold: true, right: index >= 2 })),
  ...rows.map((row) => row.map((value, index) => ({ text: value, right: index >= 2 }))),
];

/** The sender's line above the address, small, as DIN 5008 places it in the address field. */
const senderLine = text("[Firma] · [Straße Nr.] · [PLZ Ort]", after(4), `${size(8)}${grey}`);
const addressBlock = ["[Empfänger]", "[Straße Nr.]", "[PLZ Ort]"].map((line) => text(line, after(0)));
const footerNote = (content: string) => text(content, after(0), `${size(9)}${grey}`);

const letter = (): Uint8Array =>
  docx([
    senderLine,
    ...addressBlock,
    empty(36),
    text("[Ort], [Datum]", `${after(24)}${right}`),
    text("[Betreff]", after(18), bold),
    text("Sehr geehrte Damen und Herren,"),
    text("[Ihr Text]"),
    empty(),
    text("Mit freundlichen Grüßen"),
    empty(24),
    text("[Name]", after(0)),
    text("[Funktion]", after(0), grey),
  ]);

const offer = (): Uint8Array =>
  docx([
    senderLine,
    ...addressBlock,
    empty(30),
    heading("Angebot"),
    text("Angebotsnummer [Nr.] · [Datum] · gültig bis [Datum]", after(18), grey),
    text("Sehr geehrte Damen und Herren,"),
    text("vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen an:", after(12)),
    table(
      [1, 6, 2, 3, 3],
      itemRows(
        ["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"],
        [
          ["1", "[Leistung]", "1", "0,00 €", "0,00 €"],
          ["2", "[Leistung]", "1", "0,00 €", "0,00 €"],
        ],
      ),
    ),
    empty(),
    text("Summe netto: 0,00 € · zzgl. 19 % USt. · Summe brutto: 0,00 €", `${after(18)}${right}`, bold),
    text("Wir freuen uns auf Ihren Auftrag."),
    text("Mit freundlichen Grüßen"),
    empty(18),
    text("[Name]"),
  ]);

const invoice = (): Uint8Array =>
  docx([
    senderLine,
    ...addressBlock,
    empty(30),
    heading("Rechnung"),
    text("Rechnungsnummer [Nr.] · Rechnungsdatum [Datum] · Leistungszeitraum [Zeitraum]", after(18), grey),
    table(
      [1, 6, 2, 3, 3],
      itemRows(
        ["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"],
        [
          ["1", "[Leistung]", "1", "0,00 €", "0,00 €"],
          ["2", "[Leistung]", "1", "0,00 €", "0,00 €"],
        ],
      ),
    ),
    empty(),
    table(
      [9, 3],
      [
        [{ text: "Summe netto" }, { text: "0,00 €", right: true }],
        [{ text: "Umsatzsteuer 19 %" }, { text: "0,00 €", right: true }],
        [
          { text: "Rechnungsbetrag", bold: true },
          { text: "0,00 €", bold: true, right: true },
        ],
      ],
    ),
    empty(12),
    text("Bitte überweisen Sie den Betrag bis zum [Datum] auf das unten genannte Konto."),
    empty(24),
    footerNote("[Firma] · [Inhaber] · [Straße Nr.] · [PLZ Ort]"),
    footerNote("Steuernummer [Nr.] · USt-IdNr. [DE…] · IBAN [DE…] · BIC […] · [Bank]"),
  ]);

// --- Spreadsheets -----------------------------------------------------------------------------

const header = (labels: string[]): CellValue[] => labels.map((value) => ({ value, style: "bold" as const }));
const euro = (value: number | string): CellValue => ({ value, style: "currency" });

/** Quantity × price per row, the sum, the tax and the total, all as formulas. */
const calculation = (): Uint8Array => {
  const items = [1, 2, 3, 4, 5].map((index): CellValue[] => {
    const row = index + 1;
    return [`[Position ${index}]`, 1, euro(0), euro(`=B${row}*C${row}`)];
  });
  return xlsx([
    {
      name: "Kalkulation",
      widths: [36, 10, 14, 14],
      rows: [
        header(["Position", "Menge", "Einzelpreis", "Gesamt"]),
        ...items,
        [],
        [{ value: "Summe netto", style: "bold" }, "", "", { value: "=SUM(D2:D6)", style: "boldCurrency" }],
        ["Umsatzsteuer", "", { value: 0.19, style: "percent" }, euro("=D8*C9")],
        [{ value: "Summe brutto", style: "bold" }, "", "", { value: "=D8+D9", style: "boldCurrency" }],
      ],
    },
  ]);
};

const projectPlan = (): Uint8Array =>
  xlsx([
    {
      name: "Projektplan",
      widths: [36, 18, 12, 12, 14],
      rows: [
        header(["Aufgabe", "Verantwortlich", "Beginn", "Ende", "Status"]),
        ...[1, 2, 3, 4, 5].map((index): CellValue[] => [
          `[Aufgabe ${index}]`,
          "[Name]",
          { value: "", style: "date" },
          { value: "", style: "date" },
          "offen",
        ]),
      ],
    },
  ]);

const presentation = (): Uint8Array =>
  pptx([
    { layout: "title", title: "[Titel]", subtitle: "[Untertitel · Datum]" },
    { layout: "content", title: "Agenda", bullets: ["[Punkt 1]", "[Punkt 2]", "[Punkt 3]"] },
    { layout: "content", title: "[Überschrift]", bullets: ["[Inhalt]"] },
    { layout: "title", title: "Vielen Dank", subtitle: "[Kontakt]" },
  ]);

export const TEMPLATES: readonly Template[] = [
  { id: "brief", name: "Brief", format: "docx", description: "Geschäftsbrief nach DIN 5008", bytes: letter },
  { id: "angebot", name: "Angebot", format: "docx", description: "Angebot mit Positionen", bytes: offer },
  {
    id: "rechnung",
    name: "Rechnung",
    format: "docx",
    description: "Rechnung mit den Angaben nach § 14 UStG",
    bytes: invoice,
  },
  {
    id: "kalkulation",
    name: "Kalkulation",
    format: "xlsx",
    description: "Positionen, Summe, Umsatzsteuer",
    bytes: calculation,
  },
  {
    id: "projektplan",
    name: "Projektplan",
    format: "xlsx",
    description: "Aufgaben mit Zuständigen und Terminen",
    bytes: projectPlan,
  },
  {
    id: "praesentation",
    name: "Präsentation",
    format: "pptx",
    description: "Titel, Agenda, Inhalt, Abschluss",
    bytes: presentation,
  },
];
