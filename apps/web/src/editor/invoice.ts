import type { EmbeddedInvoice, Invoice } from "@schreibzeug/einvoice";

/** The e-invoice code (fast-xml-parser, pdf-lib) loads when a PDF is opened, not with the app. */
export const loadEinvoice = () => import("@schreibzeug/einvoice");

/** "2026-10-23" → "23.10.2026". */
export const germanDate = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
};

/** Cents as German money: 112574, "EUR" → "1.125,74 €". */
export const money = (cents: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
  } catch {
    // A currency code Intl does not know.
    return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(cents / 100)} ${currency}`;
  }
};

/** "DE02120300000000202051" → "DE02 1203 0000 0000 2020 51". */
export const groupedIban = (iban: string): string => iban.replace(/(.{4})(?=.)/g, "$1 ");

/** The kind of the document and the standard it follows, for the card's heading. */
export const invoiceTitle = (invoice: Invoice): string =>
  `${invoice.isCreditNote ? "Gutschrift" : "Rechnung"} ${invoice.number} vom ${germanDate(invoice.issueDate)}`;

export const syntaxLabel = (embedded: EmbeddedInvoice): string => {
  if (!embedded.invoice.ok) return "E-Rechnung";
  return embedded.invoice.value.syntax === "ubl" ? "E-Rechnung (UBL)" : "E-Rechnung (ZUGFeRD / Factur-X)";
};

/** What the card shows of the invoice, label and value, the ones the invoice has. */
export const invoiceFacts = (invoice: Invoice): Array<{ label: string; value: string }> => {
  const { currency } = invoice;
  const seller = [
    invoice.seller.name,
    [invoice.seller.postcode, invoice.seller.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const facts: Array<{ label: string; value: string | undefined }> = [
    { label: "Von", value: seller },
    { label: "An", value: invoice.buyer },
    { label: "Netto", value: money(invoice.net, currency) },
    { label: "Umsatzsteuer", value: money(invoice.tax, currency) },
    { label: "Gesamt", value: money(invoice.gross, currency) },
    {
      label: "Zu zahlen",
      value:
        invoice.duePayable !== invoice.gross || invoice.dueDate
          ? `${money(invoice.duePayable, currency)}${invoice.dueDate ? ` bis ${germanDate(invoice.dueDate)}` : ""}`
          : undefined,
    },
    { label: "IBAN", value: invoice.iban && groupedIban(invoice.iban) },
    { label: "Verwendungszweck", value: invoice.paymentReference },
    { label: "USt-IdNr.", value: invoice.seller.vatId },
    {
      label: "Leistung",
      value:
        invoice.serviceFrom &&
        (invoice.serviceTo && invoice.serviceTo !== invoice.serviceFrom
          ? `${germanDate(invoice.serviceFrom)} – ${germanDate(invoice.serviceTo)}`
          : germanDate(invoice.serviceFrom)),
    },
  ];
  return facts.filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
};

/** "4 × Barcode-Scanner: 756,00 €"; quantities in thousandths. */
export const lineText = (line: Invoice["lines"][number], currency: string): string => {
  const quantity = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(line.quantity / 1000);
  return `${quantity} × ${line.description}: ${money(line.net, currency)}`;
};
