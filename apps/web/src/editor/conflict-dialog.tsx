import { useState } from "react";
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
    <Dialog open={open} title="Inzwischen geändert" onClose={onClose}>
      <p className="m-0 text-sm text-[var(--muted-foreground)]">
        Diese Datei wurde gespeichert, nachdem du sie geöffnet hast. Speichern würde diese Änderung
        überschreiben. Lade die neue Fassung, oder behalte deinen Text als Kopie.
      </p>
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
          Als Kopie speichern
        </Button>
        <Button variant="primary" disabled={busy} onClick={onReload}>
          Neue Fassung laden
        </Button>
      </div>
    </Dialog>
  );
};
