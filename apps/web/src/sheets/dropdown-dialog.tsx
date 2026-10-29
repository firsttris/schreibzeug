import type { RuleCommands } from "@schreibzeug/editor-core";
import { useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

type DropdownDialogProps = {
  /** The list on the selection when the dialog opened; null without one. */
  values: string[] | null;
  rules: RuleCommands;
  onClose: () => void;
};

/**
 * The values a cell may take, one per line, as a dropdown on the selected cells; as Excel's "Daten
 * → Datenüberprüfung → Liste", which web-apps has as DataValidationDialog.js.
 */
export const DropdownDialog = ({ values, rules, onClose }: DropdownDialogProps) => {
  const [text, setText] = useState((values ?? []).join("\n"));
  const entries = text.split("\n").filter((line) => line.trim());

  return (
    <Dialog open title={m.dropdown_dialog_title()} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          rules.setDropdown(entries);
          onClose();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{m.dropdown_dialog_values()}</span>
          <textarea
            autoFocus
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--foreground)]"
          />
        </label>
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            disabled={values === null}
            onClick={() => {
              rules.setDropdown(null);
              onClose();
            }}
          >
            {m.dropdown_dialog_remove()}
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>{m.common_cancel()}</Button>
            <Button type="submit" variant="primary" disabled={entries.length === 0}>
              {m.common_apply()}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
};
