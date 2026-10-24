import type { Invoice } from "@schreibzeug/einvoice";
import { describe, expect, it } from "vitest";
// Intl puts a no-break space before the currency sign, so it never stands alone on a line.
import { germanDate, groupedIban, invoiceFacts, invoiceTitle, lineText, money } from "./invoice";

const invoice: Invoice = {
  syntax: "cii",
  typeCode: "380",
  isCreditNote: false,
  number: "RE-2026-0042",
  issueDate: "2026-10-23",
  dueDate: "2026-11-06",
  currency: "EUR",
  seller: { name: "Lagertechnik Weber GmbH", postcode: "01067", city: "Dresden", vatId: "DE123456789" },
  buyer: "Musterhandel KG",
  serviceFrom: "2026-10-20",
  serviceTo: "2026-10-20",
  taxes: [{ rate: 1900, category: "S", base: 94600, tax: 17974 }],
  net: 94600,
  tax: 17974,
  gross: 112574,
  duePayable: 112574,
  lines: [{ description: "Barcode-Scanner", quantity: 4000, unitCode: "H87", net: 75600, taxRate: 1900 }],
  paymentReference: "RE-2026-0042",
  iban: "DE02120300000000202051",
};

describe("the invoice card", () => {
  it("writes dates, money and IBANs the German way", () => {
    expect(germanDate("2026-11-06")).toBe("06.11.2026");
    expect(money(112574, "EUR")).toBe("1.125,74\u00a0€");
    expect(money(-690, "EUR")).toBe("-6,90\u00a0€");
    expect(groupedIban("DE02120300000000202051")).toBe("DE02 1203 0000 0000 2020 51");
  });

  it("names the document", () => {
    expect(invoiceTitle(invoice)).toBe("Rechnung RE-2026-0042 vom 23.10.2026");
    expect(invoiceTitle({ ...invoice, isCreditNote: true })).toBe("Gutschrift RE-2026-0042 vom 23.10.2026");
  });

  it("lists what the invoice says, and leaves out what it does not", () => {
    expect(invoiceFacts(invoice)).toEqual([
      { label: "Von", value: "Lagertechnik Weber GmbH, 01067 Dresden" },
      { label: "An", value: "Musterhandel KG" },
      { label: "Netto", value: "946,00\u00a0€" },
      { label: "Umsatzsteuer", value: "179,74\u00a0€" },
      { label: "Gesamt", value: "1.125,74\u00a0€" },
      { label: "Zu zahlen", value: "1.125,74\u00a0€ bis 06.11.2026" },
      { label: "IBAN", value: "DE02 1203 0000 0000 2020 51" },
      { label: "Verwendungszweck", value: "RE-2026-0042" },
      { label: "USt-IdNr.", value: "DE123456789" },
      { label: "Leistung", value: "20.10.2026" },
    ]);
    const bare = invoiceFacts({
      ...invoice,
      buyer: undefined,
      dueDate: undefined,
      iban: undefined,
      paymentReference: undefined,
      seller: { name: "Nur Name" },
      serviceFrom: undefined,
    });
    expect(bare.map((fact) => fact.label)).toEqual(["Von", "Netto", "Umsatzsteuer", "Gesamt"]);
  });

  it("writes a line with its quantity", () => {
    const [line] = invoice.lines;
    if (!line) throw new Error("no line");
    expect(lineText(line, "EUR")).toBe("4 × Barcode-Scanner: 756,00\u00a0€");
  });
});
