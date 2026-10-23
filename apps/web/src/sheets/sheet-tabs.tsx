import type { SheetCommands, SheetTab } from "@stapel/editor-core";
import { EllipsisVertical, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { MenuButton } from "../ui/menu";

export type SheetTabsProps = {
  sheets: SheetTab[];
  active: number;
  commands: SheetCommands | null;
};

/** The sheets of the workbook under the grid: switch, add, rename and delete, as Excel's tabs. */
export const SheetTabs = ({ sheets, active, commands }: SheetTabsProps) => {
  const [renaming, setRenaming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const disabled = !commands;
  const visible = sheets.map((sheet, index) => ({ ...sheet, index })).filter((sheet) => !sheet.hidden);

  return (
    <nav
      aria-label="Tabellenblätter"
      className="flex h-10 shrink-0 items-center gap-1 border-t border-[var(--border)] bg-[var(--background)] px-2"
    >
      <Button
        variant="ghost"
        aria-label="Blatt hinzufügen"
        disabled={disabled}
        onClick={() => commands?.add()}
      >
        <Plus size={16} />
      </Button>
      {/* Only the tabs scroll: a scrolling box would cut off the menu next to them. */}
      <div role="tablist" aria-label="Blätter" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {visible.map(({ name, index }) => (
          <button
            key={`${index}-${name}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            disabled={disabled}
            onClick={() => commands?.show(index)}
            onDoubleClick={() => index === active && setRenaming(true)}
            className="h-8 rounded-md px-3 text-sm whitespace-nowrap text-[var(--muted-foreground)] hover:bg-[var(--muted)] aria-selected:bg-[var(--muted)] aria-selected:font-medium aria-selected:text-[var(--foreground)]"
          >
            {name}
          </button>
        ))}
      </div>
      <MenuButton
        label="Blatt bearbeiten"
        variant="ghost"
        up
        disabled={disabled}
        groups={[
          [{ label: "Umbenennen", onSelect: () => setRenaming(true) }],
          [
            {
              label: "Löschen",
              danger: true,
              onSelect: () => {
                if (commands && !commands.remove())
                  setProblem("Das letzte Blatt kann nicht gelöscht werden.");
              },
            },
          ],
        ]}
      >
        <EllipsisVertical size={16} />
      </MenuButton>
      <RenameDialog
        open={renaming}
        name={sheets[active]?.name ?? ""}
        onRename={(name) => commands?.rename(name) ?? false}
        onClose={() => setRenaming(false)}
      />
      <Dialog open={problem !== null} title="Blatt löschen" onClose={() => setProblem(null)}>
        <p className="m-0 text-sm">{problem}</p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setProblem(null)}>
            OK
          </Button>
        </div>
      </Dialog>
    </nav>
  );
};

const RenameDialog = ({
  open,
  name,
  onRename,
  onClose,
}: {
  open: boolean;
  name: string;
  onRename: (name: string) => boolean;
  onClose: () => void;
}) => (
  <Dialog open={open} title="Blatt umbenennen" onClose={onClose}>
    <RenameForm key={name} name={name} onRename={onRename} onClose={onClose} />
  </Dialog>
);

const RenameForm = ({
  name,
  onRename,
  onClose,
}: {
  name: string;
  onRename: (name: string) => boolean;
  onClose: () => void;
}) => {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (onRename(value)) onClose();
        else
          setError("Den Namen gibt es schon, oder er enthält : \\ / ? * [ ] oder ist länger als 31 Zeichen.");
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Name des Blatts</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this name
          autoFocus
          value={value}
          maxLength={31}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)] aria-invalid:border-red-500"
        />
      </label>
      {error && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit">
          Umbenennen
        </Button>
      </div>
    </form>
  );
};
