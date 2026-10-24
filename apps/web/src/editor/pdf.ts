import { downloadBytes } from "./opened-file";

/** "Angebot.docx" → "Angebot.pdf". */
export const pdfNameFor = (name: string): string => `${name.replace(/\.[^.]*$/, "")}.pdf`;

export const downloadPdf = (bytes: Uint8Array, name: string): void =>
  downloadBytes(bytes, pdfNameFor(name), "application/pdf");

/**
 * Prints a PDF with the browser's print dialog: the PDF goes into a hidden frame, which prints once
 * it has loaded. Where the browser will not print a PDF in a frame, it opens in a new tab instead.
 */
export const printPdf = (bytes: Uint8Array): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const frame = Object.assign(document.createElement("iframe"), { src: url, title: "Drucken" });
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
