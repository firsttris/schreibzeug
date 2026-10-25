import type { InvoiceDraft } from "../src";

/** An invoice of a small IT business: two lines at 19 %, one at 7 %, a period of service. */
export const sampleDraft = (): InvoiceDraft => ({
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
    vatId: "DE 123 456 789",
    taxNumber: "201/123/45678",
    email: "rechnung@lagertechnik-weber.example",
    iban: "DE02 1203 0000 0000 2020 51",
    bic: "BYLADEM1001",
  },
  buyer: { name: "Musterhandel KG", street: "Marktplatz 1", postcode: "77815", city: "Bühl", country: "DE" },
  lines: [
    { description: "Barcode-Scanner", quantity: 4000, unit: "H87", unitPrice: 18900, taxRate: 1900 },
    { description: "Einrichtung vor Ort", quantity: 2500, unit: "HUR", unitPrice: 9500, taxRate: 1900 },
    {
      description: "Handbuch & Schulungsunterlagen",
      quantity: 1000,
      unit: "H87",
      unitPrice: 2990,
      taxRate: 700,
    },
  ],
  taxMode: "regular",
});
