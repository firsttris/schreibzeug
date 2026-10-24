import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Invoice } from "../src";
import {
  extractEmbeddedXml,
  MAX_EMBEDDED_BYTES,
  parseDecimal,
  readEmbeddedInvoice,
  readInvoiceXml,
} from "../src";

// The fixtures are written for Haben (github.com/firsttris/haben, AGPL-3.0-only, the same author).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const pdfWith = async (attachments: Array<{ name: string; content: string }>): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  document.addPage();
  for (const { name, content } of attachments) {
    await document.attach(new TextEncoder().encode(content), name, {
      mimeType: "text/xml",
      description: "Rechnung",
    });
  }
  return document.save();
};

const invoiceOf = (xml: string): Invoice => {
  const read = readInvoiceXml(xml);
  if (!read.ok) throw new Error(read.error);
  return read.value;
};

const errorOf = (xml: string): string => {
  const read = readInvoiceXml(xml);
  if (read.ok) throw new Error("read as an invoice");
  return read.error;
};

describe("parseDecimal", () => {
  it("counts in whole hundredths, without floating point", () => {
    expect(parseDecimal("1234.5", 2, true)).toBe(123450);
    expect(parseDecimal("-0.07", 2, true)).toBe(-7);
    expect(parseDecimal("100.000", 2, true)).toBe(10000);
    expect(parseDecimal(".5", 2, true)).toBe(50);
    expect(parseDecimal("12.3456", 2, false)).toBe(1235);
    expect(parseDecimal("-12.345", 2, false)).toBe(-1235);
    expect(parseDecimal("12.5", 3, false)).toBe(12500);
  });
});

describe("readInvoiceXml", () => {
  it("reads CII with any namespace prefixes", () => {
    expect(invoiceOf(fixture("cii-prefixes.xml"))).toEqual({
      syntax: "cii",
      typeCode: "380",
      isCreditNote: false,
      number: "RE-2026/0815",
      issueDate: "2026-09-15",
      dueDate: "2026-09-29",
      currency: "EUR",
      seller: {
        name: "Netzwerk Hosting GmbH",
        vatId: "DE987654321",
        taxNumber: "143/123/45678",
        street: "Marienplatz 8",
        postcode: "80331",
        city: "München",
        country: "DE",
        email: "billing@netzwerk-hosting.example",
        iban: "DE02120300000000202051",
      },
      buyer: "Erika Mustermann",
      buyerReference: "04011000-12345-34",
      serviceFrom: "2026-08-01",
      serviceTo: "2026-08-31",
      taxes: [
        { rate: 1900, category: "S", base: 15432, tax: 2932 },
        { rate: 700, category: "S", base: 2990, tax: 209 },
      ],
      net: 18422,
      tax: 3141,
      gross: 21563,
      duePayable: 20000,
      lines: [
        {
          description: "Webhosting & Domain „Business“",
          quantity: 12500,
          unitCode: "MON",
          net: 15432,
          taxRate: 1900,
        },
        { description: "Handbuch", quantity: 1000, unitCode: "H87", net: 2990, taxRate: 700 },
      ],
      paymentReference: "RE-2026/0815 K4711",
      iban: "DE02120300000000202051",
    });
  });

  it("reads ZUGFeRD 2 BASIC WL without lines and leaves a negative 380 as it is", () => {
    expect(invoiceOf(fixture("zugferd2-basicwl.xml"))).toMatchObject({
      typeCode: "380",
      isCreditNote: false,
      number: "4711-B",
      issueDate: "2026-10-01",
      dueDate: undefined,
      seller: { name: "Bürobedarf Schulze e.K.", vatId: "DE111222333", postcode: "04109" },
      buyer: "Erika Mustermann",
      net: -500,
      tax: -190,
      gross: -690,
      lines: [],
    });
  });

  it("reads UBL with a default namespace (Peppol, reverse charge)", () => {
    expect(invoiceOf(fixture("ubl-default-ns.xml"))).toMatchObject({
      syntax: "ubl",
      number: "INV-77",
      issueDate: "2026-09-20",
      dueDate: "2026-10-20",
      seller: {
        name: "CloudTools B.V.",
        vatId: "NL123456789B01",
        country: "NL",
        email: "ap@cloudtools.example",
      },
      buyer: "Erika Mustermann",
      taxes: [{ rate: 0, category: "AE", base: 4900, tax: 0 }],
      gross: 4900,
      duePayable: 4900,
      paymentReference: "INV-77",
      iban: "NL91ABNA0417164300",
    });
  });

  it("reads a UBL credit note and makes its amounts negative", () => {
    expect(invoiceOf(fixture("ubl-creditnote-cbc-default.xml"))).toMatchObject({
      typeCode: "381",
      isCreditNote: true,
      number: "GS-2026-12",
      seller: { name: "Druckerei Nord GmbH", street: "Am Hafen 2" },
      taxes: [{ rate: 1900, category: "S", base: -5000, tax: -950 }],
      gross: -5950,
      lines: [{ description: "Flyer DIN A6 (Fehldruck)", quantity: 500000, net: -5000 }],
    });
  });

  it("says why XML is no invoice it can read", () => {
    expect(errorOf("<rsm:CrossIndustryInvoice><ram:ID>1</rsm:CrossIndustryInvoice>")).toMatch(
      /^Kein gültiges XML/,
    );
    expect(errorOf("<Order><ID>1</ID></Order>")).toMatch(/Unbekanntes XML-Format <Order>/);
    expect(errorOf(fixture("ubl-default-ns.xml").replace("<cbc:ID>INV-77</cbc:ID>", ""))).toBe(
      "Rechnungsnummer fehlt in der E-Rechnung",
    );
    expect(
      errorOf(
        fixture("ubl-default-ns.xml").replace(
          ">49.00</cbc:TaxInclusiveAmount",
          ">49.001</cbc:TaxInclusiveAmount",
        ),
      ),
    ).toMatch(/mehr als 2 Nachkommastellen/);
  });
});

describe("the invoice in a PDF", () => {
  it("finds zugferd-invoice.xml among other attachments", async () => {
    const xml = fixture("cii-prefixes.xml");
    const pdf = await pdfWith([
      { name: "notiz.txt", content: "hallo" },
      { name: "anlage.xml", content: "<x/>" },
      { name: "zugferd-invoice.xml", content: xml },
    ]);
    expect(await extractEmbeddedXml(pdf)).toEqual({ filename: "zugferd-invoice.xml", xml });
    expect(await readEmbeddedInvoice(pdf)).toMatchObject({
      filename: "zugferd-invoice.xml",
      invoice: { ok: true, value: { number: "RE-2026/0815", gross: 21563 } },
    });
  });

  it("takes the first XML attachment otherwise", async () => {
    const xml = fixture("ubl-default-ns.xml");
    const pdf = await pdfWith([{ name: "Invoice INV-77.XML", content: xml }]);
    expect(await extractEmbeddedXml(pdf)).toEqual({ filename: "Invoice INV-77.XML", xml });
  });

  it("returns null for a PDF without attachments and for what is no PDF", async () => {
    expect(await readEmbeddedInvoice(await pdfWith([]))).toBeNull();
    expect(await readEmbeddedInvoice(new TextEncoder().encode("kein pdf"))).toBeNull();
  });

  it("keeps the XML of an invoice it cannot read, with why", async () => {
    const pdf = await pdfWith([{ name: "factur-x.xml", content: "<Order><ID>1</ID></Order>" }]);
    expect(await readEmbeddedInvoice(pdf)).toEqual({
      filename: "factur-x.xml",
      xml: "<Order><ID>1</ID></Order>",
      invoice: { ok: false, error: "Unbekanntes XML-Format <Order>: keine E-Rechnung (CII oder UBL)" },
    });
  });

  it("unpacks an attachment only up to the limit", async () => {
    const bomb = `<a>${" ".repeat(MAX_EMBEDDED_BYTES)}</a>`;
    const pdf = await pdfWith([{ name: "factur-x.xml", content: bomb }]);
    expect(pdf.length).toBeLessThan(1024 * 1024);
    expect(await extractEmbeddedXml(pdf)).toBeNull();
  });
});
