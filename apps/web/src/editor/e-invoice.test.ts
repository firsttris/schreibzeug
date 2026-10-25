import { describe, expect, it } from "vitest";
import {
  draftFromForm,
  eInvoiceNameFor,
  emptyLine,
  formFromDraft,
  type SellerForm,
  withRemembered,
} from "./e-invoice";

const seller: SellerForm = {
  name: "Lagertechnik Weber GmbH",
  street: "Hafenstraße 12",
  postcode: "01067",
  city: "Dresden",
  country: "DE",
  vatId: "",
  email: "",
  taxNumber: "201/123/45678",
  iban: "",
  bic: "",
};

describe("the e-invoice form", () => {
  it("turns what is typed into the draft and back", () => {
    const form = {
      number: " RE-1 ",
      issueDate: "2026-10-23",
      dueDate: "",
      serviceFrom: "2026-10-20",
      serviceTo: "",
      taxMode: "regular" as const,
      seller,
      buyer: {
        name: "Musterhandel KG",
        street: "Marktplatz 1",
        postcode: "77815",
        city: "Bühl",
        country: "de",
        vatId: "",
        email: "",
      },
      buyerReference: "",
      lines: [
        {
          description: "Einrichtung",
          quantity: "2,5",
          unit: "HUR" as const,
          unitPrice: "1.095,50",
          taxRate: "19",
        },
        { ...emptyLine("7"), quantity: "x" },
      ],
    };
    const draft = draftFromForm(form);
    expect(draft).toMatchObject({
      number: "RE-1",
      dueDate: undefined,
      serviceFrom: "2026-10-20",
      serviceTo: "2026-10-20",
      seller: { vatId: undefined, taxNumber: "201/123/45678" },
      buyer: { country: "DE" },
      buyerReference: undefined,
      lines: [
        { description: "Einrichtung", quantity: 2500, unit: "HUR", unitPrice: 109550, taxRate: 1900 },
        { description: "", quantity: 0, unit: "C62", unitPrice: 0, taxRate: 700 },
      ],
    });
    expect(formFromDraft(draft).lines[0]).toEqual({
      description: "Einrichtung",
      quantity: "2,5",
      unit: "HUR",
      unitPrice: "1095,50",
      taxRate: "19",
    });
  });

  it("shows no VAT rate for a small business", () => {
    const draft = draftFromForm({
      ...formFromDraft({
        number: "1",
        issueDate: "2026-10-23",
        currency: "EUR",
        seller: { ...seller, vatId: undefined },
        buyer: { name: "B", street: "S 1", postcode: "12345", city: "O", country: "DE" },
        lines: [{ description: "x", quantity: 1000, unit: "C62", unitPrice: 100, taxRate: 1900 }],
        taxMode: "regular",
      }),
      taxMode: "small-business",
    });
    expect(draft.lines[0]?.taxRate).toBe(0);
  });

  it("fills what the document leaves empty from the remembered seller", () => {
    expect(
      withRemembered(seller, {
        name: "Alt",
        iban: "DE02 1203 0000 0000 2020 51",
        email: "a@b.example",
        country: "AT",
      }),
    ).toEqual({ ...seller, iban: "DE02 1203 0000 0000 2020 51", email: "a@b.example", country: "AT" });
  });

  it("names the file after the document", () => {
    expect(eInvoiceNameFor("Rechnung 2026-42.docx")).toBe("Rechnung 2026-42 (E-Rechnung).pdf");
  });
});
