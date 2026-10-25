import { describe, expect, it } from "vitest";
import {
  type DocumentText,
  draftFromDocument,
  parseDate,
  parseMoney,
  parseQuantity,
  parseRate,
} from "../src";

const p = (text: string) => ({ type: "paragraph" as const, text });

/** Schreibzeug's invoice template, filled in as a person would. */
const filledTemplate = (): DocumentText => ({
  body: [
    p("Lagertechnik Weber GmbH · Hafenstraße 12 · 01067 Dresden"),
    p("Musterhandel KG"),
    p("Marktplatz 1"),
    p("77815 Bühl"),
    p(""),
    p("Rechnung"),
    p("Rechnungsnummer RE-2026-0042 · Rechnungsdatum 23.10.2026 · Leistungszeitraum 01.10.2026 – 20.10.2026"),
    {
      type: "table",
      rows: [
        ["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"],
        ["1", "Barcode-Scanner", "4", "189,00 €", "756,00 €"],
        ["2", "Einrichtung vor Ort", "2,5 Std.", "95,00 €", "237,50 €"],
      ],
    },
    p(""),
    {
      type: "table",
      rows: [
        ["Summe netto", "993,50 €"],
        ["Umsatzsteuer 19 %", "188,77 €"],
        ["Rechnungsbetrag", "1.182,27 €"],
      ],
    },
    p(""),
    p("Bitte überweisen Sie den Betrag bis zum 06.11.2026 auf das unten genannte Konto."),
    p(""),
    p("Lagertechnik Weber GmbH · Jonas Weber · Hafenstraße 12 · 01067 Dresden"),
    p(
      "Steuernummer 201/123/45678 · USt-IdNr. DE123456789 · IBAN DE02 1203 0000 0000 2020 51 · BIC BYLADEM1001 · DKB",
    ),
  ],
  headers: [],
  footers: [],
});

describe("draftFromDocument", () => {
  it("reads the filled-in invoice template", () => {
    expect(draftFromDocument(filledTemplate())).toEqual({
      draft: {
        number: "RE-2026-0042",
        issueDate: "2026-10-23",
        dueDate: "2026-11-06",
        serviceFrom: "2026-10-01",
        serviceTo: "2026-10-20",
        currency: "EUR",
        seller: {
          name: "Lagertechnik Weber GmbH",
          street: "Hafenstraße 12",
          postcode: "01067",
          city: "Dresden",
          country: "DE",
          vatId: "DE123456789",
          taxNumber: "201/123/45678",
          email: undefined,
          iban: "DE02 1203 0000 0000 2020 51",
          bic: "BYLADEM1001",
        },
        buyer: {
          name: "Musterhandel KG",
          street: "Marktplatz 1",
          postcode: "77815",
          city: "Bühl",
          country: "DE",
        },
        lines: [
          { description: "Barcode-Scanner", quantity: 4000, unit: "C62", unitPrice: 18900, taxRate: 1900 },
          { description: "Einrichtung vor Ort", quantity: 2500, unit: "HUR", unitPrice: 9500, taxRate: 1900 },
        ],
        taxMode: "regular",
      },
      statedTotal: 118227,
    });
  });

  it("leaves the template's placeholders empty", () => {
    const blank: DocumentText = {
      body: [
        p("[Firma] · [Straße Nr.] · [PLZ Ort]"),
        p("[Empfänger]"),
        p("[Straße Nr.]"),
        p("[PLZ Ort]"),
        p(""),
        p("Rechnungsnummer [Nr.] · Rechnungsdatum [Datum] · Leistungszeitraum [Zeitraum]"),
        {
          type: "table",
          rows: [
            ["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"],
            ["1", "[Leistung]", "1", "0,00 €", "0,00 €"],
          ],
        },
        p("Steuernummer [Nr.] · USt-IdNr. [DE…] · IBAN [DE…] · BIC […] · [Bank]"),
      ],
      headers: [],
      footers: [],
    };
    const { draft } = draftFromDocument(blank);
    expect(draft).toMatchObject({ number: "", issueDate: "", dueDate: undefined, serviceFrom: undefined });
    expect(draft.seller).toMatchObject({
      name: "",
      street: "",
      vatId: undefined,
      taxNumber: undefined,
      iban: undefined,
    });
    expect(draft.buyer).toMatchObject({ name: "", city: "" });
    expect(draft.lines).toEqual([
      { description: "", quantity: 1000, unit: "C62", unitPrice: 0, taxRate: 1900 },
    ]);
  });

  it("reads a small business invoice with the bank in the footer and days to pay", () => {
    const { draft } = draftFromDocument({
      body: [
        p("Rechnung Nr. 2026-17"),
        p("Datum: 1. Oktober 2026"),
        {
          type: "table",
          rows: [
            ["Leistung", "Stunden", "Satz", "Betrag"],
            ["Webdesign", "12", "60,00", "720,00"],
            ["Hosting September", "", "", "15,00"],
          ],
        },
        p("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."),
        p("Zahlbar innerhalb von 14 Tagen ohne Abzug."),
      ],
      headers: [],
      footers: [
        p("Anna Berger | Lindenweg 3a | 76530 Baden-Baden | anna@berger-design.example"),
        p("Steuer-Nr. 36/123/45678 | IBAN: DE02120300000000202051 | BIC BYLADEM1001"),
      ],
    });
    expect(draft).toMatchObject({
      number: "2026-17",
      issueDate: "2026-10-01",
      dueDate: "2026-10-15",
      taxMode: "small-business",
      seller: {
        name: "Anna Berger",
        street: "Lindenweg 3a",
        postcode: "76530",
        city: "Baden-Baden",
        email: "anna@berger-design.example",
        taxNumber: "36/123/45678",
        vatId: undefined,
        iban: "DE02 1203 0000 0000 2020 51",
      },
      lines: [
        { description: "Webdesign", quantity: 12000, unit: "HUR", unitPrice: 6000, taxRate: 0 },
        { description: "Hosting September", quantity: 1000, unitPrice: 1500, taxRate: 0 },
      ],
    });
  });

  it("finds nothing in a document that is no invoice", () => {
    const { draft, statedTotal } = draftFromDocument({
      body: [p("Hallo Schreibzeug")],
      headers: [],
      footers: [],
    });
    expect(draft).toMatchObject({ number: "", issueDate: "", lines: [], taxMode: "regular" });
    expect(statedTotal).toBeUndefined();
  });
});

describe("the details", () => {
  const draftOf = (...texts: string[]) =>
    draftFromDocument({ body: texts.map(p), headers: [], footers: [] }).draft;

  it("does not take the end of the service period for the due date", () => {
    const draft = draftOf(
      "Rechnungsdatum 23.10.2026",
      "Leistungszeitraum 01.10.2026 bis 20.10.2026",
      "Zahlbar innerhalb von 14 Tagen.",
    );
    expect([draft.serviceFrom, draft.serviceTo, draft.dueDate]).toEqual([
      "2026-10-01",
      "2026-10-20",
      "2026-11-06",
    ]);
    expect(draftOf("Bitte zahlen Sie bis zum 06.11.2026.").dueDate).toBe("2026-11-06");
  });
});

describe("the seller's VAT ID", () => {
  const vatIdOf = (text: string) =>
    draftFromDocument({ body: [], headers: [], footers: [p(text)] }).draft.seller.vatId;

  it("ends where its country's format does, not in the next word", () => {
    expect(vatIdOf("USt-IdNr. DE123456789 Amtsgericht Dresden HRB 1")).toBe("DE123456789");
    expect(vatIdOf("USt-IdNr.: DE 123 456 789 · IBAN DE02 1203 0000 0000 2020 51")).toBe("DE123456789");
    expect(vatIdOf("USt-Id ATU12345678 Firmenbuch")).toBe("ATU12345678");
    expect(vatIdOf("USt-IdNr. FRXX123456789 Paris")).toBe("FRXX123456789");
    expect(vatIdOf("USt-IdNr. DE12345 Amtsgericht")).toBeUndefined();
  });
});

describe("the table of invoice lines", () => {
  const linesOf = (rows: string[][]) =>
    draftFromDocument({ body: [{ type: "table", rows }], headers: [], footers: [] }).draft.lines;

  it("does not take the VAT rate column for the unit price", () => {
    const lines = linesOf([
      ["Beschreibung", "Menge", "USt-Satz", "Einzelpreis", "Gesamt"],
      ["Scanner", "4", "19 %", "189,00 €", "756,00 €"],
    ]);
    expect(lines.map((line) => line.unitPrice)).toEqual([18900]);
  });

  it("leaves out the rows of sums inside the table", () => {
    const lines = linesOf([
      ["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"],
      ["1", "Scanner", "4", "189,00 €", "756,00 €"],
      ["", "Zwischensumme", "", "", "756,00 €"],
      ["2", "Gesamtpaket Wartung", "1", "120,00 €", "120,00 €"],
      ["", "Summe netto", "", "", "876,00 €"],
      ["", "zzgl. USt 19 %", "", "", "166,44 €"],
      ["", "Gesamt", "", "", "1.042,44 €"],
      ["", "Netto-Summe", "", "", "876,00 €"],
      ["", "USt-Betrag 19 %", "", "", "166,44 €"],
      ["", "Brutto-Betrag", "", "", "1.042,44 €"],
    ]);
    expect(lines.map((line) => line.description)).toEqual(["Scanner", "Gesamtpaket Wartung"]);
  });

  it("keeps a line whose description only starts like a sum, without a quantity column", () => {
    const lines = linesOf([
      ["Leistung", "Betrag"],
      ["USt-Voranmeldung September 2026", "150,00 €"],
      ["Umsatzsteuer-Jahreserklärung 2025", "480,00 €"],
      ["Netto-Lohnabrechnung Oktober", "90,00 €"],
      ["Summe netto", "720,00 €"],
    ]);
    expect(lines.map((line) => line.description)).toEqual([
      "USt-Voranmeldung September 2026",
      "Umsatzsteuer-Jahreserklärung 2025",
      "Netto-Lohnabrechnung Oktober",
    ]);
  });

  it("takes an hourly rate for the price, not for the hours", () => {
    const lines = linesOf([
      ["Leistung", "Stundensatz", "Stunden", "Betrag"],
      ["Beratung", "95,00 €", "2,5", "237,50 €"],
    ]);
    expect(lines).toEqual([
      { description: "Beratung", quantity: 2500, unit: "HUR", unitPrice: 9500, taxRate: 1900 },
    ]);
  });
});

describe("German numbers and dates", () => {
  it("reads amounts, quantities and rates", () => {
    expect(parseMoney("1.182,27 €")).toBe(118227);
    expect(parseMoney("1182.27")).toBe(118227);
    expect(parseMoney("-5,5")).toBe(-550);
    expect(parseMoney("2.500")).toBe(250000);
    expect(parseMoney("kein Betrag")).toBeUndefined();
    expect(parseQuantity("2,5 Std.")).toBe(2500);
    expect(parseQuantity("0,333")).toBe(333);
    expect(parseRate("7,5 %")).toBe(750);
  });

  it("reads dates in the ways Germans write them", () => {
    expect(parseDate("23.10.2026")).toBe("2026-10-23");
    expect(parseDate("am 3.1.26")).toBe("2026-01-03");
    expect(parseDate("1. März 2026")).toBe("2026-03-01");
    expect(parseDate("2026-10-23")).toBe("2026-10-23");
    expect(parseDate("31.02.2026")).toBeUndefined();
    expect(parseDate("[Datum]")).toBeUndefined();
  });
});
