import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { BasisPoints, Cents, Invoice, Millis, Party, Read } from "./types";
import { all, attribute, first, one, text, textAt } from "./xml-tree";

/*
 * Taken from Haben (github.com/firsttris/haben, packages/einvoice/src/incoming.ts, AGPL-3.0-only,
 * the same author): failures as values instead of an error class, and the buyer's name added.
 */

/** Credit note types by UNTDID 1001 that EN 16931 allows. */
const CREDIT_NOTE_CODES = new Set([
  "81",
  "83",
  "261",
  "262",
  "296",
  "308",
  "381",
  "396",
  "420",
  "458",
  "532",
]);

/** Thrown inside this module only, and turned into a value at its edge (readInvoiceXml). */
type Refusal = { refusal: string };
function refuse(message: string): never {
  throw { refusal: message } satisfies Refusal;
}
const isRefusal = (error: unknown): error is Refusal =>
  typeof error === "object" && error !== null && "refusal" in error;

/**
 * A decimal string as an integer in 10^-scale, without floating point. exact: further decimals
 * other than 0 are refused, else rounded half up.
 */
export const parseDecimal = (value: string, scale: number, exact: boolean): number => {
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (!match[2] && !match[3])) refuse(`Ungültiger Betrag „${value}“`);
  const sign = match[1] === "-" ? -1 : 1;
  const fraction = match[3] ?? "";
  const kept = fraction.slice(0, scale).padEnd(scale, "0");
  const rest = fraction.slice(scale);
  if (exact && /[1-9]/.test(rest)) refuse(`Betrag „${value}“ hat mehr als ${scale} Nachkommastellen`);
  let result = Number(`${match[2] || "0"}${kept}`);
  if (rest !== "" && (rest[0] ?? "0") >= "5") result += 1;
  if (!Number.isSafeInteger(result)) refuse(`Betrag „${value}“ ist zu groß`);
  return sign * result || 0;
};

const cents = (value: string): Cents => parseDecimal(value, 2, true);
const roundedCents = (value: string): Cents => parseDecimal(value, 2, false);
const basisPoints = (value: string | undefined): BasisPoints =>
  value === undefined ? 0 : parseDecimal(value, 2, false);
const millis = (value: string | undefined): Millis =>
  value === undefined ? 0 : parseDecimal(value, 3, false);

/** CII format 102 (YYYYMMDD) or an ISO date → YYYY-MM-DD. */
const isoDate = (value: string | undefined): string | undefined => {
  const match = value ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value.trim()) : null;
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return undefined;
  return `${year}-${month}-${day}`;
};

const required = <T>(value: T | undefined, what: string): T =>
  value === undefined ? refuse(`${what} fehlt in der E-Rechnung`) : value;

/** The amount in the invoice's currency, where an element comes once per currency. */
const amountIn = (nodes: unknown[], currency: string): string | undefined =>
  text(
    nodes.find((n) => attribute(n, "currencyID") === currency) ??
      nodes.find((n) => !attribute(n, "currencyID")) ??
      nodes[0],
  );

const compact = (value: string | undefined) => value?.replace(/\s+/g, "").toUpperCase();

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  trimValues: true,
  // Decodes numeric character references too (&#252;).
  htmlEntities: true,
});

/** Reads an e-invoice in CII (ZUGFeRD 1 and 2, Factur-X, XRechnung) or UBL (Invoice, CreditNote). */
export const readInvoiceXml = (xml: string): Read<Invoice> => {
  try {
    return { ok: true, value: parse(xml) };
  } catch (error) {
    if (isRefusal(error)) return { ok: false, error: error.refusal };
    return {
      ok: false,
      error: `XML konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const parse = (xml: string): Invoice => {
  const source = xml.replace(/^﻿/, "");
  const valid = XMLValidator.validate(source);
  if (valid !== true) refuse(`Kein gültiges XML (Zeile ${valid.err.line}): ${valid.err.msg}`);
  const tree = parser.parse(source) as Record<string, unknown>;
  const rootName = Object.keys(tree).find((key) => !key.startsWith("?") && !key.startsWith("#"));
  const root = rootName ? tree[rootName] : undefined;
  switch (rootName) {
    case "CrossIndustryInvoice":
    case "CrossIndustryDocument":
      return finish(parseCii(root));
    case "Invoice":
    case "CreditNote":
      return finish(parseUbl(root, rootName === "CreditNote"));
    default:
      return refuse(
        rootName
          ? `Unbekanntes XML-Format <${rootName}>: keine E-Rechnung (CII oder UBL)`
          : "Leeres XML-Dokument",
      );
  }
};

/** Credit notes negative. */
const finish = (invoice: Invoice): Invoice => {
  if (!invoice.isCreditNote) return invoice;
  const negative = (value: number) => -value || 0;
  return {
    ...invoice,
    taxes: invoice.taxes.map((t) => ({ ...t, base: negative(t.base), tax: negative(t.tax) })),
    net: negative(invoice.net),
    tax: negative(invoice.tax),
    gross: negative(invoice.gross),
    duePayable: negative(invoice.duePayable),
    lines: invoice.lines.map((line) => ({ ...line, net: negative(line.net) })),
  };
};

const parseCii = (root: unknown): Invoice => {
  const header = first(root, ["ExchangedDocument"], ["HeaderExchangedDocument"]);
  const transaction = first(root, ["SupplyChainTradeTransaction"], ["SpecifiedSupplyChainTradeTransaction"]);
  if (!header || !transaction) refuse("CII-Dokument ohne Kopf oder Handelsdaten");
  const agreement = first(
    transaction,
    ["ApplicableHeaderTradeAgreement"],
    ["ApplicableSupplyChainTradeAgreement"],
  );
  const delivery = first(
    transaction,
    ["ApplicableHeaderTradeDelivery"],
    ["ApplicableSupplyChainTradeDelivery"],
  );
  const settlement = first(
    transaction,
    ["ApplicableHeaderTradeSettlement"],
    ["ApplicableSupplyChainTradeSettlement"],
  );
  const sums = first(
    settlement,
    ["SpecifiedTradeSettlementHeaderMonetarySummation"],
    ["SpecifiedTradeSettlementMonetarySummation"],
  );

  const typeCode = textAt(header, "TypeCode") ?? "380";
  const currency = required(textAt(settlement, "InvoiceCurrencyCode"), "Währung");

  const sellerNode = one(agreement, "SellerTradeParty");
  const registrations = all(sellerNode, "SpecifiedTaxRegistration", "ID");
  const registration = (scheme: string) =>
    text(registrations.find((r) => attribute(r, "schemeID") === scheme));
  const address = one(sellerNode, "PostalTradeAddress");
  const iban = compact(
    textAt(
      settlement,
      "SpecifiedTradeSettlementPaymentMeans",
      "PayeePartyCreditorFinancialAccount",
      "IBANID",
    ),
  );
  const electronic = one(sellerNode, "URIUniversalCommunication", "URIID");
  const seller: Party = {
    name: required(textAt(sellerNode, "Name"), "Name des Verkäufers"),
    vatId: registration("VA"),
    taxNumber: registration("FC"),
    street: textAt(address, "LineOne"),
    postcode: textAt(address, "PostcodeCode"),
    city: textAt(address, "CityName"),
    country: textAt(address, "CountryID"),
    email:
      textAt(sellerNode, "DefinedTradeContact", "EmailURIUniversalCommunication", "URIID") ??
      (attribute(electronic, "schemeID") === "EM" ? text(electronic) : undefined),
    iban,
  };

  const taxes = all(settlement, "ApplicableTradeTax")
    .filter((t) => (textAt(t, "TypeCode") ?? "VAT") === "VAT")
    .map((t) => ({
      rate: basisPoints(textAt(t, "RateApplicablePercent") ?? textAt(t, "ApplicablePercent")),
      category: textAt(t, "CategoryCode") ?? "S",
      base: cents(required(textAt(t, "BasisAmount"), "Steuerbasis")),
      tax: cents(required(textAt(t, "CalculatedAmount"), "Steuerbetrag")),
    }));

  const lines = all(transaction, "IncludedSupplyChainTradeLineItem").map((item) => {
    const lineSettlement = first(
      item,
      ["SpecifiedLineTradeSettlement"],
      ["SpecifiedSupplyChainTradeSettlement"],
    );
    const quantity = one(
      first(item, ["SpecifiedLineTradeDelivery"], ["SpecifiedSupplyChainTradeDelivery"]),
      "BilledQuantity",
    );
    const lineTax = one(lineSettlement, "ApplicableTradeTax");
    return {
      description:
        textAt(item, "SpecifiedTradeProduct", "Name") ??
        textAt(item, "SpecifiedTradeProduct", "Description") ??
        "",
      quantity: millis(text(quantity)),
      unitCode: attribute(quantity, "unitCode"),
      net: roundedCents(
        textAt(lineSettlement, "SpecifiedTradeSettlementLineMonetarySummation", "LineTotalAmount") ??
          textAt(lineSettlement, "SpecifiedTradeSettlementMonetarySummation", "LineTotalAmount") ??
          "0",
      ),
      taxRate: basisPoints(textAt(lineTax, "RateApplicablePercent") ?? textAt(lineTax, "ApplicablePercent")),
    };
  });

  const taxText = amountIn(all(sums, "TaxTotalAmount"), currency);
  const gross = cents(required(textAt(sums, "GrandTotalAmount"), "Gesamtbetrag"));
  const dueText = textAt(sums, "DuePayableAmount");
  const deliveryDate = isoDate(
    textAt(delivery, "ActualDeliverySupplyChainEvent", "OccurrenceDateTime", "DateTimeString"),
  );
  const period = one(settlement, "BillingSpecifiedPeriod");

  return {
    syntax: "cii",
    typeCode,
    isCreditNote: CREDIT_NOTE_CODES.has(typeCode),
    number: required(textAt(header, "ID"), "Rechnungsnummer"),
    issueDate: required(isoDate(textAt(header, "IssueDateTime", "DateTimeString")), "Rechnungsdatum"),
    dueDate: isoDate(textAt(settlement, "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString")),
    currency,
    seller,
    buyer: textAt(agreement, "BuyerTradeParty", "Name"),
    buyerReference: textAt(agreement, "BuyerReference"),
    serviceFrom: isoDate(textAt(period, "StartDateTime", "DateTimeString")) ?? deliveryDate,
    serviceTo: isoDate(textAt(period, "EndDateTime", "DateTimeString")) ?? deliveryDate,
    taxes,
    net: cents(required(textAt(sums, "TaxBasisTotalAmount"), "Nettosumme")),
    tax: taxText !== undefined ? cents(taxText) : taxes.reduce((sum, t) => sum + t.tax, 0),
    gross,
    duePayable: dueText !== undefined ? cents(dueText) : gross,
    lines,
    paymentReference: textAt(settlement, "PaymentReference"),
    iban,
  };
};

const parseUbl = (root: unknown, creditNote: boolean): Invoice => {
  const typeCode =
    textAt(root, creditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode") ?? (creditNote ? "381" : "380");
  const currency = required(textAt(root, "DocumentCurrencyCode"), "Währung");

  const party = one(root, "AccountingSupplierParty", "Party");
  const taxSchemes = all(party, "PartyTaxScheme");
  const vat = taxSchemes.find((s) => textAt(s, "TaxScheme", "ID") === "VAT");
  const other = taxSchemes.find((s) => s !== vat);
  const address = one(party, "PostalAddress");
  const endpoint = one(party, "EndpointID");
  const paymentMeans = all(root, "PaymentMeans");
  const iban = compact(paymentMeans.map((m) => textAt(m, "PayeeFinancialAccount", "ID")).find(Boolean));
  const seller: Party = {
    name: required(
      textAt(party, "PartyLegalEntity", "RegistrationName") ?? textAt(party, "PartyName", "Name"),
      "Name des Verkäufers",
    ),
    vatId: textAt(vat, "CompanyID"),
    taxNumber: textAt(other, "CompanyID"),
    street: textAt(address, "StreetName"),
    postcode: textAt(address, "PostalZone"),
    city: textAt(address, "CityName"),
    country: textAt(address, "Country", "IdentificationCode"),
    email:
      textAt(party, "Contact", "ElectronicMail") ??
      (attribute(endpoint, "schemeID") === "EM" ? text(endpoint) : undefined),
    iban,
  };
  const buyerParty = one(root, "AccountingCustomerParty", "Party");

  const taxes = all(root, "TaxTotal", "TaxSubtotal").map((t) => ({
    rate: basisPoints(textAt(t, "TaxCategory", "Percent") ?? textAt(t, "Percent")),
    category: textAt(t, "TaxCategory", "ID") ?? "S",
    base: cents(required(textAt(t, "TaxableAmount"), "Steuerbasis")),
    tax: cents(required(textAt(t, "TaxAmount"), "Steuerbetrag")),
  }));

  const lines = all(root, creditNote ? "CreditNoteLine" : "InvoiceLine").map((line) => {
    const quantity = one(line, creditNote ? "CreditedQuantity" : "InvoicedQuantity");
    return {
      description: textAt(line, "Item", "Name") ?? textAt(line, "Item", "Description") ?? "",
      quantity: millis(text(quantity)),
      unitCode: attribute(quantity, "unitCode"),
      net: roundedCents(textAt(line, "LineExtensionAmount") ?? "0"),
      taxRate: basisPoints(textAt(line, "Item", "ClassifiedTaxCategory", "Percent")),
    };
  });

  const totals = one(root, "LegalMonetaryTotal");
  const gross = cents(required(textAt(totals, "TaxInclusiveAmount"), "Gesamtbetrag"));
  const taxText = amountIn(
    all(root, "TaxTotal").map((t) => one(t, "TaxAmount")),
    currency,
  );
  const payable = textAt(totals, "PayableAmount");
  const deliveryDate = isoDate(textAt(root, "Delivery", "ActualDeliveryDate"));
  const period = one(root, "InvoicePeriod");

  return {
    syntax: "ubl",
    typeCode,
    isCreditNote: creditNote || CREDIT_NOTE_CODES.has(typeCode),
    number: required(textAt(root, "ID"), "Rechnungsnummer"),
    issueDate: required(isoDate(textAt(root, "IssueDate")), "Rechnungsdatum"),
    dueDate: isoDate(
      textAt(root, "DueDate") ?? paymentMeans.map((m) => textAt(m, "PaymentDueDate")).find(Boolean),
    ),
    currency,
    seller,
    buyer:
      textAt(buyerParty, "PartyLegalEntity", "RegistrationName") ?? textAt(buyerParty, "PartyName", "Name"),
    buyerReference: textAt(root, "BuyerReference"),
    serviceFrom: isoDate(textAt(period, "StartDate")) ?? deliveryDate,
    serviceTo: isoDate(textAt(period, "EndDate")) ?? deliveryDate,
    taxes,
    net: cents(required(textAt(totals, "TaxExclusiveAmount"), "Nettosumme")),
    tax: taxText !== undefined ? cents(taxText) : taxes.reduce((sum, t) => sum + t.tax, 0),
    gross,
    duePayable: payable !== undefined ? cents(payable) : gross,
    lines,
    paymentReference: paymentMeans.map((m) => textAt(m, "PaymentID")).find(Boolean),
    iban,
  };
};
