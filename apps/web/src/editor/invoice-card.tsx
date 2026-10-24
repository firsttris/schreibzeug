import type { EmbeddedInvoice } from "@schreibzeug/einvoice";
import { ChevronDown, ChevronUp, Download, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { invoiceFacts, invoiceTitle, lineText, loadEinvoice, syntaxLabel } from "./invoice";
import { downloadBytes } from "./opened-file";

/** The e-invoice the opened PDF carries, read once it is open; null for a PDF without one. */
export const useEmbeddedInvoice = (bytes: Uint8Array): EmbeddedInvoice | null => {
  const [embedded, setEmbedded] = useState<EmbeddedInvoice | null>(null);
  useEffect(() => {
    let current = true;
    setEmbedded(null);
    void loadEinvoice()
      .then(({ readEmbeddedInvoice }) => readEmbeddedInvoice(bytes))
      .then((found) => {
        if (current) setEmbedded(found);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [bytes]);
  return embedded;
};

/** In the collapsed card: who, how much, until when. */
const SUMMARY = new Set(["Von", "Gesamt", "Zu zahlen"]);

/**
 * Above a ZUGFeRD or Factur-X PDF: what its invoice XML says, the machine-readable invoice beside
 * the picture of it, and the XML to download.
 */
export const InvoiceCard = ({ embedded }: { embedded: EmbeddedInvoice }) => {
  const [open, setOpen] = useState(false);
  const download = () =>
    downloadBytes(
      new TextEncoder().encode(embedded.xml),
      embedded.filename || "rechnung.xml",
      "application/xml",
    );
  const { invoice } = embedded;
  const facts = invoice.ok ? invoiceFacts(invoice.value) : [];
  const shown = open ? facts : facts.filter((fact) => SUMMARY.has(fact.label));

  return (
    <section
      aria-label="E-Rechnung"
      data-testid="invoice-card"
      className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ReceiptText size={14} />
        <span className="font-medium">
          {invoice.ok ? invoiceTitle(invoice.value) : syntaxLabel(embedded)}
        </span>
        <span className="text-[var(--muted-foreground)]">
          {invoice.ok ? syntaxLabel(embedded) : ""} · {embedded.filename}
        </span>
        <span className="ml-auto flex gap-1">
          {invoice.ok && (
            <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {open ? "Weniger" : "Details"}
            </Button>
          )}
          <Button variant="ghost" onClick={download}>
            <Download size={14} />
            XML herunterladen
          </Button>
        </span>
      </div>
      {!invoice.ok && (
        <p role="alert" className="m-0 text-red-600 dark:text-red-400">
          Die Rechnungsdaten lassen sich nicht lesen: {invoice.error}
        </p>
      )}
      {shown.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr_auto_1fr]">
          {shown.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-[var(--muted-foreground)]">{fact.label}</dt>
              <dd className="m-0 tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {open && invoice.ok && (
        <>
          {invoice.value.lines.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {invoice.value.lines.map((line, index) => (
                // The XML's order is the lines' identity; two lines may read the same.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                <li key={index}>{lineText(line, invoice.value.currency)}</li>
              ))}
            </ul>
          )}
          <p className="m-0 text-[var(--muted-foreground)]">
            Die Rechnungsdaten stehen in der angehängten XML. Was im PDF geändert wird, ändert sie nicht.
          </p>
        </>
      )}
    </section>
  );
};
