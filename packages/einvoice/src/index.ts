import { extractEmbeddedXml } from "./embedded";
import { readInvoiceXml } from "./invoice";
import type { Invoice, Read } from "./types";

export { decodeXmlBytes, extractEmbeddedXml, MAX_EMBEDDED_BYTES } from "./embedded";
export { parseDecimal, readInvoiceXml } from "./invoice";
export type * from "./types";

/** The invoice a PDF carries: the attachment's name, its XML, and what that XML says. */
export type EmbeddedInvoice = { filename: string; xml: string; invoice: Read<Invoice> };

/** The e-invoice in a ZUGFeRD or Factur-X PDF, read; null for a PDF without invoice XML. */
export const readEmbeddedInvoice = async (pdf: Uint8Array): Promise<EmbeddedInvoice | null> => {
  const embedded = await extractEmbeddedXml(pdf);
  return embedded && { ...embedded, invoice: readInvoiceXml(embedded.xml) };
};
export {
  type DraftLine,
  type DraftParty,
  type DraftSeller,
  draftProblems,
  type InvoiceDraft,
  isIban,
  SMALL_BUSINESS_NOTE,
  type TaxGroup,
  type TaxMode,
  type Totals,
  taxCategory,
  totalsOf,
  UNITS,
  type UnitCode,
} from "./draft";
export { type DocumentPrefill, type DocumentText, draftFromDocument, type TextBlock } from "./from-document";
export { addDays, parseDate, parseMoney, parseQuantity, parseRate } from "./german";
export { amount, EN16931_GUIDELINE, facturXml, quantity } from "./write-cii";
export { FACTURX_FILENAME, zugferdPdf, zugferdXmp } from "./zugferd-pdf";
