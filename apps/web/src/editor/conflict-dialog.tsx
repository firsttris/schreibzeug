import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type ConflictDialogProps = {
  open: boolean;
  /** Throws away this text and opens the version saved meanwhile. */
  onReload: () => void;
  /** Keeps this text as a new file beside the original. */
  onSaveCopy: () => Promise<void>;
  onClose: () => void;
};

/**
 * Someone saved the text file after it was opened here (use-text-save.ts): saving would
 * overwrite their change, so nothing is saved until the person chooses.
 */
export const ConflictDialog = ({ open, onReload, onSaveCopy, onClose }: ConflictDialogProps) => {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <Dialog open={open} title={m.conflict_dialog_title()} onClose={onClose}>
      <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.conflict_dialog_text()}</p>
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailure(null);
            await onSaveCopy().catch((error: unknown) =>
              setFailure(error instanceof Error ? error.message : String(error)),
            );
            setBusy(false);
          }}
        >
          {m.conflict_dialog_save_copy()}
        </Button>
        <Button variant="primary" disabled={busy} onClick={onReload}>
          {m.conflict_dialog_reload()}
        </Button>
      </div>
    </Dialog>
  );
};
