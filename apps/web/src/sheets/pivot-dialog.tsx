import type { PivotCommands } from "@schreibzeug/editor-core";
import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

type PivotDialogProps = { pivots: PivotCommands; onClose: () => void };

/**
 * The source of a new pivot table, filled in with the table around the active cell; the table
 * goes on a new sheet, as web-apps' CreatePivotDialog.js does by default.
 */
export const PivotDialog = ({ pivots, onClose }: PivotDialogProps) => {
  const [source, setSource] = useState(() => pivots.sourceRange());
  const [invalid, setInvalid] = useState(false);

  return (
    <Dialog open title="Pivot-Tabelle einfügen" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pivots.insert(source.trim())) setInvalid(true);
          else onClose();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Datenbereich mit Überschriften</span>
          <input
            autoFocus
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setInvalid(false);
            }}
            aria-invalid={invalid}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--foreground)]"
          />
        </label>
        {invalid && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            Der Bereich braucht eine Zeile mit Überschriften und Daten darunter, z. B. Tabelle1!A1:D20.
          </p>
        )}
        <p className="m-0 text-sm text-[var(--muted-foreground)]">
          Die Pivot-Tabelle kommt auf ein neues Tabellenblatt.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={!source.trim()}>
            Erstellen
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
