import { m } from "../paraglide/messages";
import { downloadBytes } from "./opened-file";
import { printPages, printsPdfInFrame, renderPdfPages } from "./print-pages";

/** "Angebot.docx" → "Angebot.pdf". */
export const pdfNameFor = (name: string): string => `${name.replace(/\.[^.]*$/, "")}.pdf`;

/** "Angebot.docx" → "Angebot (PDF-A).pdf": beside the plain PDF of the same name. */
export const pdfaNameFor = (name: string): string => `${name.replace(/\.[^.]*$/, "")} (PDF-A).pdf`;

export const downloadPdf = (bytes: Uint8Array, name: string): void =>
  downloadBytes(bytes, /\.pdf$/i.test(name) ? name : pdfNameFor(name), "application/pdf");

/**
 * Prints a PDF with the browser's print dialog. Where the browser prints a PDF from a frame, it
 * does so, sharp and with its text; elsewhere (Safari, Android) the pages print as pictures.
 */
export const printPdf = (bytes: Uint8Array): Promise<void> =>
  printsPdfInFrame(navigator)
    ? Promise.resolve(printPdfInFrame(bytes))
    : renderPdfPages(bytes).then((pages) => printPages(window, pages));

/**
 * The PDF goes into a hidden frame, which prints once it has loaded. Where the browser will not
 * print a PDF in a frame, it opens in a new tab instead.
 */
const printPdfInFrame = (bytes: Uint8Array): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const frame = Object.assign(document.createElement("iframe"), { src: url, title: m.common_print() });
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.addEventListener("load", () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    // The dialog blocks until it is closed in most browsers; keep the frame a while for the others.
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  });
  document.body.append(frame);
};
