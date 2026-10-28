import type { InvoiceDraft } from "@schreibzeug/einvoice/draft";
import { useState } from "react";
import { m } from "../paraglide/messages";
import {
  eInvoiceNameFor,
  formFromDraft,
  loadEinvoiceWriter,
  rememberedSeller,
  rememberSeller,
  type SellerForm,
  withRemembered,
} from "./e-invoice";
import { EInvoiceDialog, type EInvoiceStart } from "./e-invoice-dialog";
import { downloadBytes } from "./opened-file";

type EInvoiceSource = {
  save: () => Promise<{ bytes: Uint8Array }>;
  exportPdf: ((pdfa?: boolean) => Promise<Uint8Array>) | null;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * "Als E-Rechnung (ZUGFeRD) …" of a text document: reads the invoice from the document, lets the
 * person check it, then makes the PDF/A of the document a ZUGFeRD invoice and downloads it.
 */
export const useEInvoice = (
  editor: EInvoiceSource | null,
  name: string,
  notify: (message: string) => void,
) => {
  const [start, setStart] = useState<EInvoiceStart | null>(null);

  const open = async () => {
    if (!editor) return;
    try {
      const [{ bytes }, writer] = await Promise.all([editor.save(), loadEinvoiceWriter()]);
      const { draft, statedTotal } = writer.draftFromDocument(writer.docxContent(bytes));
      const form = formFromDraft(draft);
      setStart({ form: { ...form, seller: withRemembered(form.seller, rememberedSeller()) }, statedTotal });
    } catch (error) {
      notify(m.use_e_invoice_unreadable({ error: message(error) }));
    }
  };

  const create = async (
    draft: InvoiceDraft,
    seller: SellerForm,
    remember: boolean,
  ): Promise<string | null> => {
    const exportPdf = editor?.exportPdf;
    if (!exportPdf) return m.use_e_invoice_no_pdf();
    try {
      const writer = await loadEinvoiceWriter();
      const made = await writer.zugferdPdf(await exportPdf(true), writer.facturXml(draft));
      if (!made.ok) return made.error;
      if (remember) rememberSeller(seller);
      downloadBytes(made.value, eInvoiceNameFor(name), "application/pdf");
      return null;
    } catch (error) {
      return m.use_e_invoice_failed({ error: message(error) });
    }
  };

  return {
    item: { label: m.use_e_invoice_menu(), onSelect: () => void open() },
    dialog: <EInvoiceDialog start={start} onClose={() => setStart(null)} onCreate={create} />,
  };
};
