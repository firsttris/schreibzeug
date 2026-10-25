/**
 * A ZUGFeRD invoice for the tests: a PDF that shows the invoice and carries it as Factur-X XML
 * (CII, EN 16931), attached as "factur-x.xml" with /AFRelationship /Alternative (ZUGFeRD 2.3, 7.3).
 * Written here, so its content and license are ours. The PDF is no PDF/A-3: finding and reading
 * the XML does not depend on that.
 */
import { escapeXml, TEMPLATES } from "@schreibzeug/ooxml";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { AFRelationship, PDFDocument } from "pdf-lib";
import { pdf } from "./pdf";

const ns = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};

const date = (iso: string) =>
  `<udt:DateTimeString format="102">${iso.replaceAll("-", "")}</udt:DateTimeString>`;

export const RECHNUNG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="${ns.rsm}" xmlns:ram="${ns.ram}" xmlns:udt="${ns.udt}">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>RE-2026-0042</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>${date("2026-10-23")}</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Barcode-Scanner</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>189.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="H87">4</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>756.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>2</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Einrichtung vor Ort</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>95.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="HUR">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>190.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>Lagertechnik Weber GmbH</ram:Name>
        <ram:PostalTradeAddress><ram:PostcodeCode>01067</ram:PostcodeCode><ram:LineOne>Hafenstraße 12</ram:LineOne><ram:CityName>Dresden</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE123456789</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>Musterhandel KG</ram:Name>
        <ram:PostalTradeAddress><ram:PostcodeCode>77815</ram:PostcodeCode><ram:LineOne>Marktplatz 1</ram:LineOne><ram:CityName>Bühl</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date("2026-10-20")}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>RE-2026-0042</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE02 1203 0000 0000 2020 51</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>179.74</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>946.00</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime>${date("2026-11-06")}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>946.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>946.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">179.74</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>1125.74</ram:GrandTotalAmount>
        <ram:DuePayableAmount>1125.74</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;

/** A fixed date, so the same input gives the same file. */
const WRITTEN = new Date("2026-10-23T09:00:00Z");

export const rechnungPdf = async (): Promise<Uint8Array> => {
  const shown = pdf([
    {
      lines: [
        "Rechnung RE-2026-0042",
        "Lagertechnik Weber GmbH, Hafenstraße 12, 01067 Dresden",
        "an Musterhandel KG · 23.10.2026",
        "4 × Barcode-Scanner à 189,00 EUR = 756,00 EUR",
        "2 Std. Einrichtung vor Ort à 95,00 EUR = 190,00 EUR",
        "Netto 946,00 EUR · USt. 19 % 179,74 EUR · Gesamt 1.125,74 EUR",
        "Zahlbar bis 06.11.2026 auf DE02 1203 0000 0000 2020 51",
      ],
    },
  ]);
  const document = await PDFDocument.load(shown, { updateMetadata: false });
  await document.attach(new TextEncoder().encode(RECHNUNG_XML), "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X Invoice",
    creationDate: WRITTEN,
    modificationDate: WRITTEN,
    afRelationship: AFRelationship.Alternative,
  });
  return document.save({ useObjectStreams: false });
};

/**
 * Schreibzeug's invoice template filled in as a person would: each text run of the template in
 * order, replaced by what is written there. The same invoice as rechnung.pdf, as a Word document.
 */
const FILLED: Record<string, string[]> = {
  "[Firma] · [Straße Nr.] · [PLZ Ort]": ["Lagertechnik Weber GmbH · Hafenstraße 12 · 01067 Dresden"],
  "[Empfänger]": ["Musterhandel KG"],
  "[Straße Nr.]": ["Marktplatz 1"],
  "[PLZ Ort]": ["77815 Bühl"],
  "Rechnungsnummer [Nr.] · Rechnungsdatum [Datum] · Leistungszeitraum [Zeitraum]": [
    "Rechnungsnummer RE-2026-0042 · Rechnungsdatum 23.10.2026 · Leistungszeitraum 20.10.2026",
  ],
  // Position 1, its quantity, the quantity of position 2.
  "1": ["1", "4", "2"],
  "[Leistung]": ["Barcode-Scanner", "Einrichtung vor Ort"],
  "0,00 €": ["189,00 €", "756,00 €", "95,00 €", "190,00 €", "946,00 €", "179,74 €", "1.125,74 €"],
  "Bitte überweisen Sie den Betrag bis zum [Datum] auf das unten genannte Konto.": [
    "Bitte überweisen Sie den Betrag bis zum 06.11.2026 auf das unten genannte Konto.",
  ],
  "[Firma] · [Inhaber] · [Straße Nr.] · [PLZ Ort]": [
    "Lagertechnik Weber GmbH · Jonas Weber · Hafenstraße 12 · 01067 Dresden",
  ],
  "Steuernummer [Nr.] · USt-IdNr. [DE…] · IBAN [DE…] · BIC […] · [Bank]": [
    "Steuernummer 201/123/45678 · USt-IdNr. DE123456789 · IBAN DE02 1203 0000 0000 2020 51 · BIC BYLADEM1001 · Sparkasse",
  ],
};

export const rechnungDocx = (): Uint8Array => {
  const template = TEMPLATES.find((candidate) => candidate.id === "rechnung");
  if (!template) throw new Error("The invoice template is missing.");
  const files = unzipSync(template.bytes());
  const queues = Object.fromEntries(Object.entries(FILLED).map(([text, values]) => [text, [...values]]));
  const xml = strFromU8(files["word/document.xml"] ?? new Uint8Array()).replace(
    /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
    (whole, open: string, text: string, close: string) => {
      const next = queues[text]?.shift();
      return next === undefined ? whole : `${open}${escapeXml(next)}${close}`;
    },
  );
  // A fixed date, as the template's own package has, so the same input gives the same file.
  return zipSync({ ...files, "word/document.xml": strToU8(xml) }, { mtime: new Date(1980, 0, 1) });
};
