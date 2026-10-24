import type { PdfEditor } from "@schreibzeug/editor-core";
import { useEffect, useState } from "react";
import { createRecognizer, loadPdfOcr, makeSearchable, OCR_DPI, type OcrStep } from "./ocr";
import { OcrDialog } from "./ocr-dialog";

/** Whether every page of the PDF is only an image, checked once it is open (pdf-lib loads then). */
const useScanned = (bytes: Uint8Array): boolean => {
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    let current = true;
    setScanned(false);
    void loadPdfOcr()
      .then(({ textlessPages }) => textlessPages(bytes))
      .then(({ count, textless }) => {
        if (current) setScanned(count > 0 && textless.length === count);
      })
      // A PDF pdf-lib cannot read (encrypted, damaged) is simply not taken for a scan.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [bytes]);
  return scanned;
};

type UseOcr = {
  editor: PdfEditor | null;
  bytes: Uint8Array;
  readOnly: boolean;
  /** Stores the PDF as the newest version and opens it (the edit page). */
  onReplace: ((bytes: Uint8Array) => Promise<void>) | undefined;
  /** The PDF is digitally signed: a text layer would break the signature. */
  signed: boolean;
};

/**
 * "Text erkennen": recognises the text of scanned pages and stores the PDF, searchable, as a new
 * version. Comes with the dialog and whether the open PDF looks like a scan.
 */
export const useOcr = ({ editor, bytes, readOnly, onReplace, signed }: UseOcr) => {
  const [open, setOpen] = useState(false);
  const scanned = useScanned(bytes);

  const run = async (onStep: (step: OcrStep) => void): Promise<string | null> => {
    if (!editor || !onReplace) return "Hier lässt sich kein Text erkennen.";
    if (signed) return "Das PDF ist digital signiert; eine Textebene würde die Signatur ungültig machen.";
    try {
      const saved = await editor.save();
      const result = await makeSearchable({
        pdf: saved.bytes,
        render: (page) => editor.pages.render(page, OCR_DPI),
        recognizer: createRecognizer,
        onStep,
      });
      if (!result.ok) return result.error;
      await onReplace(result.pdf);
      return null;
    } catch (error) {
      return `Der Text konnte nicht erkannt werden: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  return {
    scanned,
    start: editor && onReplace && !readOnly ? () => setOpen(true) : null,
    dialog: <OcrDialog open={open} onClose={() => setOpen(false)} onRun={run} />,
  };
};
