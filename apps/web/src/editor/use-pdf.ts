import { m } from "../paraglide/messages";
import type { PdfActions } from "./file-menu";
import { downloadPdf, pdfaNameFor, printPdf } from "./pdf";

type PdfSource = { exportPdf: ((pdfa?: boolean) => Promise<Uint8Array>) | null };

/**
 * Download and print as PDF, for an editor that can make one. Making it takes a moment (the
 * converter embeds the fonts), so the person is told; a failure says why.
 */
export const usePdf = (
  editor: PdfSource | null,
  name: string,
  notify: (message: string) => void,
): PdfActions => {
  const exportPdf = editor?.exportPdf;
  if (!exportPdf) return null;
  const make = async (use: (bytes: Uint8Array) => void | Promise<void>, pdfa = false) => {
    notify(pdfa ? m.use_pdf_making_pdfa() : m.use_pdf_making_pdf());
    try {
      await use(await exportPdf(pdfa));
    } catch (error) {
      notify(m.use_pdf_failed({ error: error instanceof Error ? error.message : String(error) }));
    }
  };
  return {
    download: () => void make((bytes) => downloadPdf(bytes, name)),
    downloadPdfA: () => void make((bytes) => downloadPdf(bytes, pdfaNameFor(name)), true),
    print: () => void make(printPdf),
  };
};
