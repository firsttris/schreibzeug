import {
  type DraftParty,
  type DraftSeller,
  type InvoiceDraft,
  SMALL_BUSINESS_NOTE,
  taxCategory,
  totalsOf,
} from "./draft";
import type { BasisPoints, Cents, Millis } from "./types";

/*
 * Factur-X / ZUGFeRD 2 in the EN 16931 profile ("COMFORT"): UN/CEFACT Cross Industry Invoice
 * D16B, elements in the order its schema requires (CrossIndustryInvoice_100pD16B.xsd), checked
 * against the CEN validation artefacts (ConnectingEurope/eInvoicing-EN16931, cii/xslt).
 */

/** BT-24: the specification the invoice follows; EN 16931 itself, as Factur-X EN 16931 writes it. */
export const EN16931_GUIDELINE = "urn:cen.eu:en16931:2017";

const NAMESPACES =
  'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" ' +
  'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" ' +
  'xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" ' +
  'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"';

/**
 * What XML 1.0 has no character for (its production Char: C0 controls but tab, LF and CR, lone
 * surrogates, U+FFFE and U+FFFF), as a space: Word's line break (U+000B) reads as one.
 */
const NOT_XML_CHAR = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export const escapeXml = (text: string): string =>
  text
    .replace(NOT_XML_CHAR, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** <ram:Name>text</ram:Name>, or nothing for an empty value. */
const element = (name: string, value: string | undefined, attributes = ""): string => {
  const text = escapeXml(value ?? "").trim();
  return text === "" ? "" : `<${name}${attributes}>${text}</${name}>`;
};

/** 123456 → "1234.56". */
export const amount = (cents: Cents): string => {
  const whole = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, "0")}`;
};

/** 1500 → "1.5", 2000 → "2". */
export const quantity = (millis: Millis): string => {
  const whole = Math.abs(millis);
  const fraction = String(whole % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${millis < 0 ? "-" : ""}${Math.floor(whole / 1000)}${fraction ? `.${fraction}` : ""}`;
};

/** 1900 → "19", 750 → "7.5". */
const percent = (rate: BasisPoints): string => quantity(rate * 10);

/** Format 102 of UNTDID 2379: "2026-10-23" → "20261023". */
const date = (iso: string): string =>
  `<udt:DateTimeString format="102">${iso.replaceAll("-", "")}</udt:DateTimeString>`;

const compact = (value: string | undefined) => value?.replace(/\s+/g, "").toUpperCase();

const address = (party: DraftParty): string =>
  "<ram:PostalTradeAddress>" +
  element("ram:PostcodeCode", party.postcode) +
  element("ram:LineOne", party.street) +
  element("ram:CityName", party.city) +
  element("ram:CountryID", party.country) +
  "</ram:PostalTradeAddress>";

const contact = (email: string | undefined): string =>
  email?.trim()
    ? `<ram:DefinedTradeContact><ram:EmailURIUniversalCommunication>${element("ram:URIID", email)}</ram:EmailURIUniversalCommunication></ram:DefinedTradeContact>`
    : "";

const registration = (id: string | undefined, scheme: "VA" | "FC"): string =>
  id?.trim()
    ? `<ram:SpecifiedTaxRegistration>${element("ram:ID", scheme === "VA" ? compact(id) : id, ` schemeID="${scheme}"`)}</ram:SpecifiedTaxRegistration>`
    : "";

/**
 * BR-CO-26 wants the seller identified by an ID, a legal registration or the VAT ID. Without a VAT
 * ID, as a small business often has none, the Steuernummer is the seller's ID (BT-29), as Haben
 * writes it.
 */
const sellerId = (party: DraftSeller): string =>
  party.vatId?.trim() ? "" : element("ram:ID", party.taxNumber);

const seller = (party: DraftSeller): string =>
  "<ram:SellerTradeParty>" +
  sellerId(party) +
  element("ram:Name", party.name) +
  contact(party.email) +
  address(party) +
  registration(party.vatId, "VA") +
  registration(party.taxNumber, "FC") +
  "</ram:SellerTradeParty>";

const buyer = (party: DraftParty): string =>
  "<ram:BuyerTradeParty>" +
  element("ram:Name", party.name) +
  contact(party.email) +
  address(party) +
  registration(party.vatId, "VA") +
  "</ram:BuyerTradeParty>";

const lineItem = (draft: InvoiceDraft, net: Cents, index: number): string => {
  const line = draft.lines[index];
  if (!line) return "";
  const rate = draft.taxMode === "small-business" ? 0 : line.taxRate;
  return (
    "<ram:IncludedSupplyChainTradeLineItem>" +
    `<ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>` +
    `<ram:SpecifiedTradeProduct>${element("ram:Name", line.description)}</ram:SpecifiedTradeProduct>` +
    `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amount(line.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
    `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${line.unit}">${quantity(line.quantity)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>` +
    "<ram:SpecifiedLineTradeSettlement>" +
    `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${taxCategory(draft.taxMode, rate)}</ram:CategoryCode><ram:RateApplicablePercent>${percent(rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>` +
    `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
    "</ram:SpecifiedLineTradeSettlement>" +
    "</ram:IncludedSupplyChainTradeLineItem>"
  );
};

/** The day of delivery (BT-72) when the service has one date; a period goes into BG-14 instead. */
const delivery = (draft: InvoiceDraft): string => {
  const single = draft.serviceFrom && (!draft.serviceTo || draft.serviceTo === draft.serviceFrom);
  return single
    ? `<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date(draft.serviceFrom ?? "")}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>`
    : "<ram:ApplicableHeaderTradeDelivery/>";
};

const period = (draft: InvoiceDraft): string =>
  draft.serviceFrom && draft.serviceTo && draft.serviceTo !== draft.serviceFrom
    ? `<ram:BillingSpecifiedPeriod><ram:StartDateTime>${date(draft.serviceFrom)}</ram:StartDateTime><ram:EndDateTime>${date(draft.serviceTo)}</ram:EndDateTime></ram:BillingSpecifiedPeriod>`
    : "";

/** BG-16: a SEPA credit transfer (UNTDID 4461 code 58) to the seller's account. */
const paymentMeans = (seller: DraftSeller): string =>
  seller.iban?.trim()
    ? "<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode>" +
      `<ram:PayeePartyCreditorFinancialAccount>${element("ram:IBANID", compact(seller.iban))}</ram:PayeePartyCreditorFinancialAccount>` +
      (seller.bic?.trim()
        ? `<ram:PayeeSpecifiedCreditorFinancialInstitution>${element("ram:BICID", compact(seller.bic))}</ram:PayeeSpecifiedCreditorFinancialInstitution>`
        : "") +
      "</ram:SpecifiedTradeSettlementPaymentMeans>"
    : "";

/** The invoice as Factur-X XML (CII, EN 16931 profile). Check it with draftProblems first. */
export const facturXml = (draft: InvoiceDraft): string => {
  const totals = totalsOf(draft);
  const taxes = totals.taxes
    .map(
      (group) =>
        "<ram:ApplicableTradeTax>" +
        `<ram:CalculatedAmount>${amount(group.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>` +
        (group.category === "E" ? element("ram:ExemptionReason", SMALL_BUSINESS_NOTE) : "") +
        `<ram:BasisAmount>${amount(group.base)}</ram:BasisAmount><ram:CategoryCode>${group.category}</ram:CategoryCode>` +
        `<ram:RateApplicablePercent>${percent(group.rate)}</ram:RateApplicablePercent>` +
        "</ram:ApplicableTradeTax>",
    )
    .join("");
  const notes = [draft.note, draft.taxMode === "small-business" ? SMALL_BUSINESS_NOTE : undefined]
    .filter((note): note is string => Boolean(note?.trim()))
    .map((note) => `<ram:IncludedNote>${element("ram:Content", note)}</ram:IncludedNote>`)
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<rsm:CrossIndustryInvoice ${NAMESPACES}>` +
    `<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${EN16931_GUIDELINE}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>` +
    "<rsm:ExchangedDocument>" +
    element("ram:ID", draft.number) +
    "<ram:TypeCode>380</ram:TypeCode>" +
    `<ram:IssueDateTime>${date(draft.issueDate)}</ram:IssueDateTime>` +
    notes +
    "</rsm:ExchangedDocument>" +
    "<rsm:SupplyChainTradeTransaction>" +
    totals.lines.map((net, index) => lineItem(draft, net, index)).join("") +
    "<ram:ApplicableHeaderTradeAgreement>" +
    element("ram:BuyerReference", draft.buyerReference) +
    seller(draft.seller) +
    buyer(draft.buyer) +
    "</ram:ApplicableHeaderTradeAgreement>" +
    delivery(draft) +
    "<ram:ApplicableHeaderTradeSettlement>" +
    element("ram:PaymentReference", draft.paymentReference ?? draft.number) +
    element("ram:InvoiceCurrencyCode", draft.currency) +
    paymentMeans(draft.seller) +
    taxes +
    period(draft) +
    (draft.dueDate
      ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime>${date(draft.dueDate)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`
      : "") +
    "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>" +
    `<ram:LineTotalAmount>${amount(totals.net)}</ram:LineTotalAmount>` +
    `<ram:TaxBasisTotalAmount>${amount(totals.net)}</ram:TaxBasisTotalAmount>` +
    `<ram:TaxTotalAmount currencyID="${escapeXml(draft.currency)}">${amount(totals.tax)}</ram:TaxTotalAmount>` +
    `<ram:GrandTotalAmount>${amount(totals.gross)}</ram:GrandTotalAmount>` +
    `<ram:DuePayableAmount>${amount(totals.gross)}</ram:DuePayableAmount>` +
    "</ram:SpecifiedTradeSettlementHeaderMonetarySummation>" +
    "</ram:ApplicableHeaderTradeSettlement>" +
    "</rsm:SupplyChainTradeTransaction>" +
    "</rsm:CrossIndustryInvoice>\n"
  );
};
