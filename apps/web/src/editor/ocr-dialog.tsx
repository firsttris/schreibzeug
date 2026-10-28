import { ScanText } from "lucide-react";
import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import type { OcrStep } from "./ocr";

export type OcrDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Recognises the text and stores the PDF; resolves with why it could not, or null once done. */
  onRun: (onStep: (step: OcrStep) => void) => Promise<string | null>;
};

const stepText = ({ page, of, fraction }: OcrStep) =>
  page === 0 ? m.ocr_dialog_loading() : m.ocr_dialog_step({ page, of, percent: Math.round(fraction * 100) });

/** "Text erkennen": what it does, then its progress page by page. */
export const OcrDialog = ({ open, onClose, onRun }: OcrDialogProps) => (
  <Dialog open={open} title={m.ocr_dialog_title()} onClose={onClose}>
    {open && <OcrForm onClose={onClose} onRun={onRun} />}
  </Dialog>
);

const OcrForm = ({ onClose, onRun }: Omit<OcrDialogProps, "open">) => {
  const [step, setStep] = useState<OcrStep | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async () => {
    setFailure(null);
    setStep({ page: 0, of: 0, fraction: 0 });
    const problem = await onRun(setStep);
    setStep(null);
    if (problem) setFailure(problem);
    else onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.ocr_dialog_intro()}</p>
      {step && (
        <p role="status" className="m-0 text-sm">
          {stepText(step)}
        </p>
      )}
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose} disabled={step !== null}>
          {m.common_cancel()}
        </Button>
        <Button variant="primary" type="button" onClick={() => void run()} disabled={step !== null}>
          {step ? m.ocr_dialog_running() : m.ocr_dialog_title()}
        </Button>
      </div>
    </div>
  );
};

/** Above a PDF made only of images: its text can be neither searched nor copied, until recognised. */
export const ScanNotice = ({ onRecognize }: { onRecognize: (() => void) | null }) => (
  <div
    data-testid="scan-notice"
    className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-xs"
  >
    <ScanText size={14} />
    <span>{m.ocr_dialog_scan_notice()}</span>
    {onRecognize && (
      <Button variant="ghost" type="button" onClick={onRecognize}>
        {m.ocr_dialog_title()}
      </Button>
    )}
  </div>
);
