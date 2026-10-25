import { describe, expect, it } from "vitest";
import {
  amount,
  draftProblems,
  facturXml,
  isIban,
  quantity,
  readInvoiceXml,
  SMALL_BUSINESS_NOTE,
  totalsOf,
} from "../src";
import { sampleDraft } from "./sample-draft";

const read = (xml: string) => {
  const result = readInvoiceXml(xml);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("totalsOf", () => {
  it("adds the lines, and the VAT once per rate from its base", () => {
    expect(totalsOf(sampleDraft())).toEqual({
      // 4 × 189,00; 2,5 × 95,00; 1 × 29,90
      lines: [75600, 23750, 2990],
      taxes: [
        { category: "S", rate: 1900, base: 99350, tax: 18877 },
        { category: "S", rate: 700, base: 2990, tax: 209 },
      ],
      net: 102340,
      tax: 19086,
      gross: 121426,
    });
  });

  it("rounds half away from zero, in cents", () => {
    const totals = totalsOf({
      taxMode: "regular",
      lines: [{ description: "x", quantity: 333, unit: "HUR", unitPrice: 1050, taxRate: 1900 }],
    });
    // 0,333 × 10,50 = 3,4965 → 3,50; 19 % of 3,50 = 0,665 → 0,67
    expect(totals).toMatchObject({ lines: [350], net: 350, tax: 67, gross: 417 });
  });

  it("shows no VAT for a small business under § 19 UStG", () => {
    const totals = totalsOf({ ...sampleDraft(), taxMode: "small-business" });
    expect(totals.taxes).toEqual([{ category: "E", rate: 0, base: 102340, tax: 0 }]);
    expect(totals.gross).toBe(102340);
  });
});

describe("facturXml", () => {
  it("writes an EN 16931 invoice that reads back as written", () => {
    const xml = facturXml(sampleDraft());
    expect(xml).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(read(xml)).toEqual({
      syntax: "cii",
      typeCode: "380",
      isCreditNote: false,
      number: "RE-2026-0042",
      issueDate: "2026-10-23",
      dueDate: "2026-11-06",
      currency: "EUR",
      seller: {
        name: "Lagertechnik Weber GmbH",
        vatId: "DE123456789",
        taxNumber: "201/123/45678",
        street: "Hafenstraße 12",
        postcode: "01067",
        city: "Dresden",
        country: "DE",
        email: "rechnung@lagertechnik-weber.example",
        iban: "DE02120300000000202051",
      },
      buyer: "Musterhandel KG",
      buyerReference: undefined,
      serviceFrom: "2026-10-01",
      serviceTo: "2026-10-20",
      taxes: [
        { rate: 1900, category: "S", base: 99350, tax: 18877 },
        { rate: 700, category: "S", base: 2990, tax: 209 },
      ],
      net: 102340,
      tax: 19086,
      gross: 121426,
      duePayable: 121426,
      lines: [
        { description: "Barcode-Scanner", quantity: 4000, unitCode: "H87", net: 75600, taxRate: 1900 },
        { description: "Einrichtung vor Ort", quantity: 2500, unitCode: "HUR", net: 23750, taxRate: 1900 },
        {
          description: "Handbuch & Schulungsunterlagen",
          quantity: 1000,
          unitCode: "H87",
          net: 2990,
          taxRate: 700,
        },
      ],
      paymentReference: "RE-2026-0042",
      iban: "DE02120300000000202051",
    });
  });

  it("writes a single day of service as the delivery date", () => {
    const xml = facturXml({ ...sampleDraft(), serviceTo: "2026-10-01" });
    expect(xml).toContain("<ram:ActualDeliverySupplyChainEvent>");
    expect(xml).not.toContain("<ram:BillingSpecifiedPeriod>");
    expect(read(xml)).toMatchObject({ serviceFrom: "2026-10-01", serviceTo: "2026-10-01" });
  });

  it("writes a small business without VAT, its tax number as the seller's ID", () => {
    const draft = sampleDraft();
    const xml = facturXml({
      ...draft,
      taxMode: "small-business",
      seller: { ...draft.seller, vatId: undefined },
    });
    expect(xml).toContain("<ram:SellerTradeParty><ram:ID>201/123/45678</ram:ID>");
    expect(xml).toContain(`<ram:ExemptionReason>${SMALL_BUSINESS_NOTE}</ram:ExemptionReason>`);
    expect(read(xml)).toMatchObject({
      taxes: [{ rate: 0, category: "E", base: 102340, tax: 0 }],
      tax: 0,
      gross: 102340,
    });
  });

  it("escapes what it writes, and leaves out what is empty", () => {
    const draft = sampleDraft();
    const xml = facturXml({
      ...draft,
      note: "Danke <3 & bis bald",
      seller: { ...draft.seller, email: " ", iban: undefined, bic: undefined },
    });
    expect(xml).toContain("<ram:Content>Danke &lt;3 &amp; bis bald</ram:Content>");
    expect(xml).not.toContain("EmailURIUniversalCommunication");
    expect(xml).not.toContain("PaymentMeans");
  });

  it("writes what XML 1.0 has no character for as a space", () => {
    const draft = sampleDraft();
    const [scanner, ...rest] = draft.lines;
    const lines = scanner ? [{ ...scanner, description: "Zeile\u000Bzwei\u0000\uFFFF" }, ...rest] : rest;
    const xml = facturXml({ ...draft, lines, note: "Gruß\uD800" });
    for (const forbidden of ["\u000B", "\u0000", "\uFFFF", "\uD800"]) expect(xml).not.toContain(forbidden);
    expect(read(xml).lines[0]?.description).toBe("Zeile zwei");
    expect(xml).toContain("<ram:Content>Gruß</ram:Content>");
  });
});

describe("draftProblems", () => {
  it("finds nothing in a complete invoice", () => {
    expect(draftProblems(sampleDraft())).toEqual([]);
  });

  it("names what is missing or wrong", () => {
    const draft = sampleDraft();
    expect(
      draftProblems({
        ...draft,
        number: " ",
        dueDate: undefined,
        seller: { ...draft.seller, vatId: undefined, taxNumber: "", iban: "DE02 1203 0000 0000 2020 52" },
        buyer: { ...draft.buyer, city: "", country: "Deutschland" },
        lines: [{ description: "", quantity: 0, unit: "H87", unitPrice: 100, taxRate: 1900 }],
      }),
    ).toEqual([
      "Die Rechnungsnummer fehlt.",
      "Das Fälligkeitsdatum fehlt.",
      "Der Rechnungssteller braucht eine USt-IdNr. oder eine Steuernummer.",
      "Die IBAN stimmt nicht.",
      "Anschrift des Empfängers ist unvollständig (Straße, PLZ, Ort).",
      "Land des Empfängers fehlt (zwei Buchstaben, z. B. DE).",
      "Position 1 hat keine Beschreibung.",
      "Position 1 hat keine Menge.",
    ]);
    expect(draftProblems({ ...draft, lines: [] })).toEqual(["Die Rechnung hat keine Positionen."]);
  });

  it("takes only days the calendar has", () => {
    const draft = sampleDraft();
    expect(draftProblems({ ...draft, issueDate: "2026-02-31", dueDate: "2026-13-01" })).toEqual([
      "Das Rechnungsdatum fehlt.",
      "Das Fälligkeitsdatum ist kein Datum.",
    ]);
    expect(draftProblems({ ...draft, issueDate: "2028-02-29" })).toEqual([]);
  });

  it("refuses a negative unit price, which EN 16931 forbids (BR-27)", () => {
    const draft = sampleDraft();
    const discount = {
      description: "Rabatt",
      quantity: 1000,
      unit: "C62" as const,
      unitPrice: -1000,
      taxRate: 1900,
    };
    expect(draftProblems({ ...draft, lines: [...draft.lines, discount] })).toEqual([
      "Position 4 hat einen negativen Einzelpreis; Rabatte als eigene Position kann Schreibzeug noch nicht schreiben.",
    ]);
  });
});

describe("numbers as the XML writes them", () => {
  it("writes amounts with two decimals and quantities without trailing zeros", () => {
    expect([amount(121426), amount(-7), amount(0)]).toEqual(["1214.26", "-0.07", "0.00"]);
    expect([quantity(2500), quantity(4000), quantity(333)]).toEqual(["2.5", "4", "0.333"]);
  });

  it("checks IBANs by their check digits", () => {
    expect(isIban("DE02 1203 0000 0000 2020 51")).toBe(true);
    expect(isIban("de02120300000000202051")).toBe(true);
    expect(isIban("DE02 1203 0000 0000 2020 52")).toBe(false);
    expect(isIban("keine")).toBe(false);
  });
});
