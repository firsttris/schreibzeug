import type { InvoiceDraft, TaxMode, UnitCode } from "@schreibzeug/einvoice/draft";
import { parseMoney, parseQuantity, parseRate } from "@schreibzeug/einvoice/german";

/** The e-invoice code (pdf-lib, the document reader) loads when someone makes one, not with the app. */
export const loadEinvoiceWriter = () =>
  Promise.all([import("@schreibzeug/einvoice"), import("@schreibzeug/ooxml")]).then(([einvoice, ooxml]) => ({
    ...einvoice,
    docxContent: ooxml.docxContent,
  }));

/*
 * The dialog edits text, as people type it ("2,5", "1.234,56"); the draft has numbers. These turn
 * one into the other: amounts in cents, quantities in thousandths, rates in hundredths of a percent.
 */

export type LineForm = {
  description: string;
  quantity: string;
  unit: UnitCode;
  unitPrice: string;
  taxRate: string;
};

export type PartyForm = {
  name: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  vatId: string;
  email: string;
};

export type SellerForm = PartyForm & { taxNumber: string; iban: string; bic: string };

export type InvoiceForm = {
  number: string;
  issueDate: string;
  dueDate: string;
  serviceFrom: string;
  serviceTo: string;
  taxMode: TaxMode;
  seller: SellerForm;
  buyer: PartyForm;
  buyerReference: string;
  lines: LineForm[];
};

const german = (value: number, decimals: number, minimum = decimals) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: minimum,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(value);

export const centsText = (cents: number) => german(cents / 100, 2);
export const millisText = (millis: number) => german(millis / 1000, 3, 0);
export const rateText = (rate: number) => german(rate / 100, 2, 0);

export const emptyLine = (taxRate = "19"): LineForm => ({
  description: "",
  quantity: "1",
  unit: "C62",
  unitPrice: "",
  taxRate,
});

export const formFromDraft = (draft: InvoiceDraft): InvoiceForm => ({
  number: draft.number,
  issueDate: draft.issueDate,
  dueDate: draft.dueDate ?? "",
  serviceFrom: draft.serviceFrom ?? "",
  serviceTo: draft.serviceTo ?? "",
  taxMode: draft.taxMode,
  seller: {
    name: draft.seller.name,
    street: draft.seller.street,
    postcode: draft.seller.postcode,
    city: draft.seller.city,
    country: draft.seller.country,
    vatId: draft.seller.vatId ?? "",
    email: draft.seller.email ?? "",
    taxNumber: draft.seller.taxNumber ?? "",
    iban: draft.seller.iban ?? "",
    bic: draft.seller.bic ?? "",
  },
  buyer: {
    name: draft.buyer.name,
    street: draft.buyer.street,
    postcode: draft.buyer.postcode,
    city: draft.buyer.city,
    country: draft.buyer.country,
    vatId: draft.buyer.vatId ?? "",
    email: draft.buyer.email ?? "",
  },
  buyerReference: draft.buyerReference ?? "",
  lines: draft.lines.map((line) => ({
    description: line.description,
    quantity: millisText(line.quantity),
    unit: line.unit,
    unitPrice: line.unitPrice === 0 ? "" : centsText(line.unitPrice),
    taxRate: rateText(line.taxRate),
  })),
});

const optional = (value: string) => (value.trim() === "" ? undefined : value.trim());

/** The draft the form describes; text that is no number counts as 0, which the checks then name. */
export const draftFromForm = (form: InvoiceForm): InvoiceDraft => ({
  number: form.number.trim(),
  issueDate: form.issueDate,
  dueDate: optional(form.dueDate),
  serviceFrom: optional(form.serviceFrom),
  serviceTo: optional(form.serviceTo) ?? optional(form.serviceFrom),
  currency: "EUR",
  seller: {
    name: form.seller.name.trim(),
    street: form.seller.street.trim(),
    postcode: form.seller.postcode.trim(),
    city: form.seller.city.trim(),
    country: form.seller.country.trim().toUpperCase(),
    vatId: optional(form.seller.vatId),
    email: optional(form.seller.email),
    taxNumber: optional(form.seller.taxNumber),
    iban: optional(form.seller.iban),
    bic: optional(form.seller.bic),
  },
  buyer: {
    name: form.buyer.name.trim(),
    street: form.buyer.street.trim(),
    postcode: form.buyer.postcode.trim(),
    city: form.buyer.city.trim(),
    country: form.buyer.country.trim().toUpperCase(),
    vatId: optional(form.buyer.vatId),
    email: optional(form.buyer.email),
  },
  buyerReference: optional(form.buyerReference),
  lines: form.lines.map((line) => ({
    description: line.description.trim(),
    quantity: parseQuantity(line.quantity) ?? 0,
    unit: line.unit,
    unitPrice: parseMoney(line.unitPrice) ?? 0,
    taxRate: form.taxMode === "small-business" ? 0 : (parseRate(line.taxRate) ?? 0),
  })),
  taxMode: form.taxMode,
});

/** The seller's details, kept in this browser for the next invoice (per viewer, not shared). */
const SELLER_KEY = "schreibzeug:e-invoice-seller";

export const rememberedSeller = (): Partial<SellerForm> => {
  try {
    const stored = window.localStorage.getItem(SELLER_KEY);
    return stored ? (JSON.parse(stored) as Partial<SellerForm>) : {};
  } catch {
    return {};
  }
};

export const rememberSeller = (seller: SellerForm): void => {
  try {
    window.localStorage.setItem(SELLER_KEY, JSON.stringify(seller));
  } catch {
    // Storage may be off (a private window); the dialog works without it.
  }
};

/**
 * What the document says wins; what it leaves empty comes from the remembered seller. The country
 * is always remembered: the document reader cannot tell it and assumes Germany.
 */
export const withRemembered = (seller: SellerForm, remembered: Partial<SellerForm>): SellerForm => {
  const pick = (key: keyof SellerForm) =>
    seller[key].trim() === "" ? (remembered[key] ?? seller[key]) : seller[key];
  return {
    name: pick("name"),
    street: pick("street"),
    postcode: pick("postcode"),
    city: pick("city"),
    country: remembered.country ?? seller.country,
    vatId: pick("vatId"),
    email: pick("email"),
    taxNumber: pick("taxNumber"),
    iban: pick("iban"),
    bic: pick("bic"),
  };
};

/** "Rechnung 2026-42.docx" → "Rechnung 2026-42 (E-Rechnung).pdf". */
export const eInvoiceNameFor = (name: string): string => `${name.replace(/\.[^.]*$/, "")} (E-Rechnung).pdf`;
