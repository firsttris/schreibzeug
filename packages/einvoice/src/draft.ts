import type { BasisPoints, Cents, Millis } from "./types";

/*
 * An invoice to write as an e-invoice: what the person states, from which the amounts follow.
 * The rules cited are EN 16931-1 business rules (BR-…), as the CEN validation artefacts check them.
 */

/** Regular VAT (S, or Z at 0 %), or a small business under § 19 UStG that shows no VAT (E). */
export type TaxMode = "regular" | "small-business";

/** The reason BR-E-10 asks for when the VAT category is "exempt" (E). */
export const SMALL_BUSINESS_NOTE = "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG";

/** UN/ECE Recommendation 20 units, the ones invoices for services and goods mostly use. */
export const UNITS = {
  H87: "Stück",
  C62: "Einheit",
  HUR: "Stunde",
  DAY: "Tag",
  MON: "Monat",
  LS: "Pauschale",
  KGM: "Kilogramm",
  MTR: "Meter",
} as const;
export type UnitCode = keyof typeof UNITS;

export type DraftLine = {
  description: string;
  quantity: Millis;
  unit: UnitCode;
  /** Net price of one unit. */
  unitPrice: Cents;
  taxRate: BasisPoints;
};

export type DraftParty = {
  name: string;
  street: string;
  postcode: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  vatId?: string | undefined;
  email?: string | undefined;
};

export type DraftSeller = DraftParty & {
  /** Steuernummer: needed where there is no VAT ID (BR-CO-26). */
  taxNumber?: string | undefined;
  iban?: string | undefined;
  bic?: string | undefined;
};

export type InvoiceDraft = {
  number: string;
  /** ISO dates, YYYY-MM-DD. */
  issueDate: string;
  dueDate?: string | undefined;
  serviceFrom?: string | undefined;
  serviceTo?: string | undefined;
  currency: string;
  seller: DraftSeller;
  buyer: DraftParty;
  /** Leitweg-ID or the buyer's order reference (BT-10). */
  buyerReference?: string | undefined;
  lines: DraftLine[];
  taxMode: TaxMode;
  paymentReference?: string | undefined;
  note?: string | undefined;
};

/** a × b / 1000, rounded half away from zero, in integers: quantity in thousandths × price. */
const lineAmount = (quantity: Millis, unitPrice: Cents): Cents => {
  const product = BigInt(quantity) * BigInt(unitPrice);
  const sign = product < 0n ? -1n : 1n;
  return Number(sign * ((sign * product + 500n) / 1000n));
};

/** base × rate, the rate in hundredths of a percent, rounded half away from zero. */
const taxOf = (base: Cents, rate: BasisPoints): Cents => {
  const product = BigInt(base) * BigInt(rate);
  const sign = product < 0n ? -1n : 1n;
  return Number(sign * ((sign * product + 5000n) / 10000n));
};

/** UNTDID 5305: E for § 19, else S, or Z for a line at 0 %. */
export const taxCategory = (mode: TaxMode, rate: BasisPoints): "S" | "Z" | "E" =>
  mode === "small-business" ? "E" : rate === 0 ? "Z" : "S";

export type TaxGroup = { category: "S" | "Z" | "E"; rate: BasisPoints; base: Cents; tax: Cents };

export type Totals = {
  lines: Cents[];
  taxes: TaxGroup[];
  net: Cents;
  tax: Cents;
  gross: Cents;
};

/** What the lines add up to: each line, the VAT per category and rate (BG-23), the sums. */
export const totalsOf = (draft: Pick<InvoiceDraft, "lines" | "taxMode">): Totals => {
  const lines = draft.lines.map((line) => lineAmount(line.quantity, line.unitPrice));
  const groups = new Map<string, TaxGroup>();
  draft.lines.forEach((line, index) => {
    const rate = draft.taxMode === "small-business" ? 0 : line.taxRate;
    const category = taxCategory(draft.taxMode, rate);
    const key = `${category}:${rate}`;
    const group = groups.get(key) ?? { category, rate, base: 0, tax: 0 };
    groups.set(key, { ...group, base: group.base + (lines[index] ?? 0) });
  });
  // The tax is computed once per group from its base (BR-CO-17), not summed from the lines.
  const taxes = [...groups.values()].map((group) => ({ ...group, tax: taxOf(group.base, group.rate) }));
  const net = lines.reduce((sum, amount) => sum + amount, 0);
  const tax = taxes.reduce((sum, group) => sum + group.tax, 0);
  return { lines, taxes, net, tax, gross: net + tax };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string | undefined): value is string =>
  value !== undefined && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** ISO 13616: the check digits of an IBAN, mod 97. */
export const isIban = (value: string): boolean => {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{11,30}$/.test(iban)) return false;
  const digits = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (letter) =>
    String(letter.charCodeAt(0) - 55),
  );
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
};

const filled = (value: string | undefined) => value !== undefined && value.trim() !== "";

const partyProblems = (party: DraftParty, who: string): string[] => [
  ...(filled(party.name) ? [] : [`Name ${who} fehlt.`]),
  ...(filled(party.street) && filled(party.postcode) && filled(party.city)
    ? []
    : [`Anschrift ${who} ist unvollständig (Straße, PLZ, Ort).`]),
  ...(/^[A-Z]{2}$/.test(party.country) ? [] : [`Land ${who} fehlt (zwei Buchstaben, z. B. DE).`]),
];

/**
 * What keeps the draft from being a valid EN 16931 invoice, in German; empty when nothing does.
 * Checked here rather than by the validator, so the dialog can say it before anything is made.
 */
export const draftProblems = (draft: InvoiceDraft): string[] => [
  ...(filled(draft.number) ? [] : ["Die Rechnungsnummer fehlt."]),
  ...(isDate(draft.issueDate) ? [] : ["Das Rechnungsdatum fehlt."]),
  ...(draft.dueDate === undefined || isDate(draft.dueDate) ? [] : ["Das Fälligkeitsdatum ist kein Datum."]),
  ...(draft.dueDate === undefined ? ["Das Fälligkeitsdatum fehlt."] : []),
  ...(draft.serviceFrom === undefined || isDate(draft.serviceFrom)
    ? []
    : ["Der Leistungszeitraum ist kein Datum."]),
  ...(draft.serviceTo === undefined || isDate(draft.serviceTo)
    ? []
    : ["Der Leistungszeitraum ist kein Datum."]),
  ...(draft.serviceFrom && draft.serviceTo && draft.serviceTo < draft.serviceFrom
    ? ["Der Leistungszeitraum endet vor seinem Beginn."]
    : []),
  ...(/^[A-Z]{3}$/.test(draft.currency) ? [] : ["Die Währung fehlt (drei Buchstaben, z. B. EUR)."]),
  ...partyProblems(draft.seller, "des Rechnungsstellers"),
  ...(filled(draft.seller.vatId) || filled(draft.seller.taxNumber)
    ? []
    : ["Der Rechnungssteller braucht eine USt-IdNr. oder eine Steuernummer."]),
  ...(draft.seller.iban === undefined || isIban(draft.seller.iban) ? [] : ["Die IBAN stimmt nicht."]),
  ...partyProblems(draft.buyer, "des Empfängers"),
  ...(draft.lines.length > 0 ? [] : ["Die Rechnung hat keine Positionen."]),
  ...draft.lines.flatMap((line, index) => [
    ...(filled(line.description) ? [] : [`Position ${index + 1} hat keine Beschreibung.`]),
    ...(line.quantity === 0 ? [`Position ${index + 1} hat keine Menge.`] : []),
    ...(line.taxRate < 0 || line.taxRate > 10_000
      ? [`Position ${index + 1} hat keinen gültigen Steuersatz.`]
      : []),
  ]),
  ...(totalsOf(draft).gross < 0
    ? ["Der Rechnungsbetrag ist negativ; eine Gutschrift kann Schreibzeug noch nicht schreiben."]
    : []),
];
