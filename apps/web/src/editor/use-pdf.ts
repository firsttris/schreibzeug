import type { PdfActions } from "./file-menu";
import { downloadPdf, printPdf } from "./pdf";

type PdfSource = { exportPdf: (() => Promise<Uint8Array>) | null };

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
  const make = async (use: (bytes: Uint8Array) => void) => {
    notify("PDF wird erstellt …");
    try {
      use(await exportPdf());
    } catch (error) {
      notify(
        `Das PDF konnte nicht erstellt werden: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return {
    download: () => void make((bytes) => downloadPdf(bytes, name)),
    print: () => void make(printPdf),
  };
};
