import {
  type DraftLine,
  type DraftParty,
  type DraftSeller,
  type InvoiceDraft,
  isIban,
  type UnitCode,
} from "./draft";
import { addDays, DATE_PATTERN, parseDate, parseMoney, parseQuantity, parseRate } from "./german";
import type { Cents } from "./types";

/*
 * What a Word invoice says, read from its text for the e-invoice dialog to start from. The patterns
 * follow how German invoices are laid out (DIN 5008: the sender's line above the address, the
 * address field, the details, a table of lines, the sums, the bank in the footer), as Schreibzeug's
 * invoice template has them. What is not found stays empty for the person to fill in; nothing is
 * guessed that an invoice would then claim.
 */

/** A paragraph or a table, as the document reader gives them (@schreibzeug/ooxml docxContent). */
export type TextBlock = { type: "paragraph"; text: string } | { type: "table"; rows: string[][] };
export type DocumentText = { body: TextBlock[]; headers: TextBlock[]; footers: TextBlock[] };

export type DocumentPrefill = {
  draft: InvoiceDraft;
  /** The total the document states ("Rechnungsbetrag"), to compare with what the lines add up to. */
  statedTotal: Cents | undefined;
};

/** A template's placeholder ("[Nr.]") is no value. */
const real = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && !/^\[.*\]$/.test(trimmed) ? trimmed : undefined;
};

const linesOf = (blocks: TextBlock[]): string[] =>
  blocks.flatMap((block) =>
    block.type === "paragraph" ? block.text.split("\n") : block.rows.map((row) => row.join(" · ")),
  );

const first = <I, T>(items: I[], read: (item: I) => T | undefined): T | undefined => {
  for (const item of items) {
    const found = read(item);
    if (found !== undefined) return found;
  }
  return undefined;
};

const after = (pattern: RegExp) => (text: string) => real(pattern.exec(text)?.[1]);

const NUMBER = /Rechnungs(?:nummer|nr\.?|-Nr\.?)\s*:?\s*([^\s·|,;]+)/i;
const NUMBER_IN_HEADING = /^Rechnung\s+(?:Nr\.?\s*)?([A-Z0-9][\w\-/]*\d[\w\-/]*)\s*$/i;
const dateAfter = (label: string) => new RegExp(`${label}\\s*:?\\s*${DATE_PATTERN.source}`, "i");
const SERVICE = new RegExp(
  `(?:Leistungs(?:zeitraum|datum)|Lieferdatum|Lieferzeitraum)\\s*:?\\s*${DATE_PATTERN.source}(?:\\s*(?:-|–|bis)\\s*${DATE_PATTERN.source})?`,
  "i",
);
// "bis" after a date ends a period ("01.10.2026 bis 20.10.2026"), it is no due date.
const DUE = new RegExp(
  `(?:(?<![\\d.]\\s*)bis\\s+(?:zum\\s+)?|fällig\\s+(?:am\\s+)?|zahlbar\\s+bis\\s+(?:zum\\s+)?)${DATE_PATTERN.source}`,
  "i",
);
const DUE_IN_DAYS = /(?:innerhalb\s+(?:von\s+)?|binnen\s+)(\d{1,3})\s+Tag/i;
const TAX_RATE =
  /(?:Umsatzsteuer|USt\.?|MwSt\.?|Mehrwertsteuer)\s*(\d{1,2}(?:,\d+)?)\s*%|(\d{1,2}(?:,\d+)?)\s*%\s*(?:USt|MwSt|Umsatzsteuer|Mehrwertsteuer)/i;
const SMALL_BUSINESS = /§\s*19\s*UStG|Kleinunternehmer/i;
const TOTAL = /Rechnungsbetrag|Gesamtbetrag|Summe\s+brutto|Bruttobetrag|Gesamtsumme|Endbetrag|zu\s+zahlen/i;
/** After a space only digits go on ("DE 123 456 789"), so the next word is not taken along. */
const VAT_ID = /USt-?Id(?:\.|-)?(?:Nr\.?)?\s*:?\s*([A-Z]{2}\s?[\dA-Z]+(?:\s\d[\dA-Z]*)*)/i;
const TAX_NUMBER = /Steuer(?:nummer|-?Nr\.?)\s*:?\s*(\d[\d/ ]{7,}\d)/i;
const IBAN = /IBAN\s*:?\s*([A-Z]{2}\d{2}(?:\s?[A-Z\d]){11,30})/i;
const BIC = /BIC\s*:?\s*([A-Z]{6}[A-Z\d]{2}(?:[A-Z\d]{3})?)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const POSTCODE_CITY = /^(?:D-)?(\d{5})\s+(.+)$/;
const STREET = /^\D.*\s\d+\s?[a-z]?(?:\s?-\s?\d+)?$/i;

/** The VAT ID formats with a fixed length, as the European Commission's VIES lists them. */
const VAT_ID_FORMATS: Record<string, RegExp> = {
  AT: /^ATU\d{8}/,
  BE: /^BE[01]\d{9}/,
  DE: /^DE\d{9}/,
  DK: /^DK\d{8}/,
  FI: /^FI\d{8}/,
  IT: /^IT\d{11}/,
  LU: /^LU\d{8}/,
  NL: /^NL\d{9}B\d{2}/,
  PL: /^PL\d{10}/,
  SE: /^SE\d{12}/,
};

/** The VAT ID in the text, as long as its country's format says, or 8 to 12 characters after it. */
const vatIdIn = (text: string): string | undefined => {
  const found = real(VAT_ID.exec(text)?.[1])?.replace(/\s+/g, "").toUpperCase();
  if (!found) return undefined;
  const format = VAT_ID_FORMATS[found.slice(0, 2)];
  if (format) return format.exec(found)?.[0];
  return found.length >= 10 && found.length <= 14 ? found : undefined;
};

/** The IBAN in the text, cut back until its check digits hold ("… 2020 51 BIC" holds without " BIC"). */
const ibanIn = (text: string): string | undefined => {
  const found = IBAN.exec(text)?.[1]?.replace(/\s+/g, "").toUpperCase();
  if (!found) return undefined;
  for (let length = found.length; length >= 15; length--) {
    if (isIban(found.slice(0, length))) return found.slice(0, length).replace(/(.{4})(?=.)/g, "$1 ");
  }
  return undefined;
};

/** Address parts as found; any of them may be missing. */
type FoundAddress = {
  name?: string | undefined;
  street?: string | undefined;
  postcode?: string | undefined;
  city?: string | undefined;
};

/** "Firma · Straße 1 · 12345 Ort" → the parts of a one-line address. */
const addressInLine = (line: string): FoundAddress | undefined => {
  const parts = line
    .split(/\s*[·•|,]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const place = parts.findIndex((part) => POSTCODE_CITY.test(part));
  if (place < 1 || parts.some((part) => /^\[.*\]$/.test(part))) return undefined;
  const [, postcode, city] = POSTCODE_CITY.exec(parts[place] ?? "") ?? [];
  const street = parts
    .slice(1, place)
    .reverse()
    .find((part) => STREET.test(part));
  return { name: parts[0], street, postcode, city };
};

/** The address field: the lines after the sender's line up to the first empty one. */
const addressField = (paragraphs: string[]): FoundAddress => {
  const start = paragraphs.findIndex((line) => addressInLine(line) !== undefined) + 1;
  const block: string[] = [];
  for (const line of paragraphs.slice(start, start + 8)) {
    if (line.trim() === "") {
      if (block.length > 0) break;
      continue;
    }
    block.push(line.trim());
  }
  const place = block.findIndex((line) => POSTCODE_CITY.test(line));
  if (place < 1) return {};
  const [, postcode, city] = POSTCODE_CITY.exec(block[place] ?? "") ?? [];
  const street = block
    .slice(0, place)
    .reverse()
    .find((line) => STREET.test(line));
  return {
    name: real(block[0]),
    street: real(street),
    postcode,
    city: real(city),
  };
};

const UNIT_WORDS: Array<[RegExp, UnitCode]> = [
  [/\b(?:std\.?|stunden?|h)\b/i, "HUR"],
  [/\b(?:tage?|pt|personentage?)\b/i, "DAY"],
  [/\b(?:monate?|mon\.?)\b/i, "MON"],
  [/\b(?:stück|stk\.?)\b/i, "H87"],
  [/\b(?:pauschal|pauschale|psch\.?)\b/i, "LS"],
  [/\bkg\b/i, "KGM"],
  [/\bm\b/i, "MTR"],
];

const unitOf = (text: string): UnitCode => UNIT_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "C62";

/** The columns of a table of invoice lines; the quantity's header may name the unit ("Stunden"). */
type Columns = { description: number; quantity: number; price: number; total: number; quantityLabel: string };

/** "Stundensatz" is a price, "USt-Satz" or "Steuersatz" the VAT rate. */
const TAX_RATE_COLUMN = /ust|mwst|steuer/i;

/** Which columns of a table's header hold what, for a table of invoice lines. */
const columnsOf = (header: string[]): Columns | undefined => {
  const find = (pattern: RegExp) => header.findIndex((cell) => pattern.test(cell));
  const description = find(/beschreibung|leistung|bezeichnung|artikel|tätigkeit|text/i);
  const price = header.findIndex(
    (cell) => /preis/i.test(cell) || (/satz/i.test(cell) && !TAX_RATE_COLUMN.test(cell)),
  );
  // The price column first: "Stundensatz" names hours too, but is the price of one.
  const quantity = header.findIndex(
    (cell, index) => index !== price && /menge|anzahl|stunden|std\.?|stk/i.test(cell),
  );
  const total = header.findLastIndex((cell) => /gesamt|betrag|summe|netto/i.test(cell));
  if (description < 0 || (price < 0 && total < 0)) return undefined;
  return { description, quantity, price, total, quantityLabel: header[quantity] ?? "" };
};

/** A sum's label ("Summe netto", "Zwischensumme", "zzgl. USt 19 %"), not "Gesamtpaket". */
const SUM_LABEL =
  /^(?:(?:zwischen|end|gesamt)?summe|gesamt(?:betrag)?|(?:netto|brutto)(?:betrag)?|übertrag|rechnungsbetrag|(?:zzgl\.?\s+)?(?:umsatzsteuer|ust|mwst|mehrwertsteuer))(?:\b|$)/i;

/** A row of sums inside the table of lines: a sum's label and no quantity. */
const isSumRow = (row: string[], columns: Columns): boolean =>
  row.some((cell) => SUM_LABEL.test(cell.trim())) &&
  (columns.quantity < 0 || (row[columns.quantity] ?? "").trim() === "");

const linesFromTable = (rows: string[][], columns: Columns, taxRate: number): DraftLine[] =>
  rows.flatMap((row) => {
    if (isSumRow(row, columns)) return [];
    const description = real(row[columns.description]);
    const quantityText = columns.quantity >= 0 ? (row[columns.quantity] ?? "") : "";
    const quantity = parseQuantity(quantityText) ?? 1000;
    const price = columns.price >= 0 ? parseMoney(row[columns.price] ?? "") : undefined;
    const total = columns.total >= 0 ? parseMoney(row[columns.total] ?? "") : undefined;
    const unitPrice =
      price ?? (total !== undefined && quantity !== 0 ? Math.round((total * 1000) / quantity) : undefined);
    if (!description && unitPrice === undefined) return [];
    return [
      {
        description: description ?? "",
        quantity,
        unit: unitOf(`${quantityText} ${columns.quantityLabel}`),
        unitPrice: unitPrice ?? 0,
        taxRate,
      },
    ];
  });

const emptyParty = (): DraftParty => ({ name: "", street: "", postcode: "", city: "", country: "DE" });

const party = <T extends DraftParty>(base: T, found: FoundAddress | undefined): T => ({
  ...base,
  name: real(found?.name) ?? base.name,
  street: real(found?.street) ?? base.street,
  postcode: real(found?.postcode) ?? base.postcode,
  city: real(found?.city) ?? base.city,
});

/** The invoice the document's text describes, as far as it can be read. */
export const draftFromDocument = (document: DocumentText): DocumentPrefill => {
  const paragraphs = document.body.flatMap((block) =>
    block.type === "paragraph" ? block.text.split("\n") : [],
  );
  const all = [...linesOf(document.headers), ...linesOf(document.body), ...linesOf(document.footers)];
  // The seller's details: the sender's line and the footer, as letterheads put them.
  const sellerLines = [
    ...linesOf(document.footers),
    ...paragraphs.slice(-8),
    ...linesOf(document.headers),
    ...paragraphs.slice(0, 3),
  ];

  const issueDate =
    first(all, (text) => parseDate(dateAfter("Rechnungsdatum").exec(text)?.[1] ?? "")) ??
    first(all, (text) => parseDate(dateAfter("(?:^|\\s)Datum").exec(text)?.[1] ?? ""));
  const service = first(all, (text) => SERVICE.exec(text) ?? undefined);
  const serviceFrom = service ? parseDate(service[1] ?? "") : undefined;
  const serviceTo = service?.[2] ? parseDate(service[2]) : serviceFrom;
  const dueInDays = first(all, (text) => DUE_IN_DAYS.exec(text)?.[1]);
  const dueDate =
    first(all, (text) => parseDate(DUE.exec(text)?.[1] ?? "")) ??
    (issueDate && dueInDays ? addDays(issueDate, Number(dueInDays)) : undefined);

  const smallBusiness = all.some((text) => SMALL_BUSINESS.test(text));
  const rateMatch = first(all, (text) => TAX_RATE.exec(text) ?? undefined);
  const taxRate = smallBusiness ? 0 : (parseRate(rateMatch?.[1] ?? rateMatch?.[2] ?? "") ?? 1900);

  const tables = document.body.flatMap((block) => (block.type === "table" ? [block.rows] : []));
  const lines =
    first(tables, (rows) => {
      const columns = columnsOf(rows[0] ?? []);
      return columns ? linesFromTable(rows.slice(1), columns, taxRate) : undefined;
    }) ?? [];

  const totalLine = all.filter((text) => TOTAL.test(text)).at(-1);
  const statedTotal = totalLine
    ? [...totalLine.matchAll(/-?\d[\d.\s]*,\d{2}/g)].map((match) => parseMoney(match[0])).at(-1)
    : undefined;

  const sellerFound = first(sellerLines, addressInLine);
  const seller: DraftSeller = {
    ...party({ ...emptyParty() }, sellerFound),
    vatId: first(sellerLines, vatIdIn),
    taxNumber: first(sellerLines, after(TAX_NUMBER)),
    email: first(sellerLines, (text) => EMAIL.exec(text)?.[0]),
    iban: first(sellerLines, ibanIn),
    bic: first(sellerLines, after(BIC))?.toUpperCase(),
  };

  return {
    draft: {
      number: first(all, after(NUMBER)) ?? first(paragraphs, after(NUMBER_IN_HEADING)) ?? "",
      issueDate: issueDate ?? "",
      dueDate,
      serviceFrom,
      serviceTo,
      currency: "EUR",
      seller,
      buyer: party(emptyParty(), addressField(paragraphs)),
      lines,
      taxMode: smallBusiness ? "small-business" : "regular",
    },
    statedTotal,
  };
};
