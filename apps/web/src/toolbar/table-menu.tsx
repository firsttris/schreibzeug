import type { TextCommands } from "@stapel/editor-core";
import { Table } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { popoverPanel, usePopover } from "../ui/use-popover";

const GRID = { columns: 8, rows: 6 };

type Size = { columns: number; rows: number };

/** Word's way to insert a table: point at the size in a grid, click. */
const SizeGrid = ({ onPick }: { onPick: (size: Size) => void }) => {
  const [hover, setHover] = useState<Size>({ columns: 1, rows: 1 });
  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${GRID.columns}, 1.25rem)` }}
        onPointerLeave={() => setHover({ columns: 1, rows: 1 })}
      >
        {Array.from({ length: GRID.rows }, (_, row) =>
          Array.from({ length: GRID.columns }, (_, column) => {
            const size = { columns: column + 1, rows: row + 1 };
            const inside = size.columns <= hover.columns && size.rows <= hover.rows;
            return (
              <button
                key={`${size.columns}x${size.rows}`}
                type="button"
                aria-label={`Tabelle ${size.columns} × ${size.rows}`}
                onPointerEnter={() => setHover(size)}
                onFocus={() => setHover(size)}
                onClick={() => onPick(size)}
                className={`size-5 rounded-sm border ${inside ? "border-[var(--docx)] bg-[var(--docx-muted)]" : "border-[var(--border)] bg-[var(--background)]"}`}
              />
            );
          }),
        )}
      </div>
      <span className="text-center text-xs text-[var(--muted-foreground)] tabular-nums">
        {hover.columns} × {hover.rows} Tabelle
      </span>
    </div>
  );
};

type Action = { label: string; run: (commands: TextCommands) => void; danger?: boolean };

const ACTIONS: Action[][] = [
  [
    { label: "Zeile oberhalb einfügen", run: (c) => c.addRow("above") },
    { label: "Zeile unterhalb einfügen", run: (c) => c.addRow("below") },
    { label: "Spalte links einfügen", run: (c) => c.addColumn("left") },
    { label: "Spalte rechts einfügen", run: (c) => c.addColumn("right") },
  ],
  [
    { label: "Zeile löschen", run: (c) => c.deleteRow(), danger: true },
    { label: "Spalte löschen", run: (c) => c.deleteColumn(), danger: true },
    { label: "Tabelle löschen", run: (c) => c.deleteTable(), danger: true },
  ],
];

export type TableMenuProps = { inTable: boolean; disabled: boolean; commands: TextCommands | null };

/**
 * One button for tables: outside a table it inserts one, inside it offers rows and columns, as the
 * context Word shows changes with the cursor.
 */
export const TableMenu = ({ inTable, disabled, commands }: TableMenuProps) => {
  const { open, toggle, close, ref } = usePopover();
  const run = (action: (commands: TextCommands) => void) => {
    if (commands) action(commands);
    close();
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="toggle"
        aria-label="Tabelle"
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={inTable}
        disabled={disabled}
        onClick={toggle}
      >
        <Table size={16} />
      </Button>
      {open && (
        <div className={popoverPanel}>
          {inTable ? (
            <div role="menu" aria-label="Tabelle bearbeiten" className="flex min-w-52 flex-col">
              {ACTIONS.map((group, index) => (
                <div
                  key={group[0]?.label}
                  className={`flex flex-col ${index > 0 ? "mt-1 border-t border-[var(--border)] pt-1" : ""}`}
                >
                  {group.map(({ label, run: action, danger }) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      onClick={() => run(action)}
                      className={`h-8 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)] ${danger ? "text-red-600 dark:text-red-400" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <SizeGrid onPick={({ columns, rows }) => run((c) => c.insertTable(columns, rows))} />
          )}
        </div>
      )}
    </div>
  );
};
