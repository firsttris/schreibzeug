import type { TextCommands } from "@schreibzeug/editor-core";
import { Table } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { type MenuItem, MenuList } from "../ui/menu";
import { popoverPanel, usePopover } from "../ui/use-popover";

const GRID = { columns: 8, rows: 6 };

type Size = { columns: number; rows: number };

/** Word's way to insert a table: point at the size in a grid, click. */
export const SizeGrid = ({ onPick }: { onPick: (size: Size) => void }) => {
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

/** Rows, columns and the table itself: for the toolbar button, the menus and the context menu. */
export const tableActions = (run: (action: (commands: TextCommands) => void) => void): MenuItem[][] => [
  [
    { label: "Zeile oberhalb einfügen", onSelect: () => run((c) => c.addRow("above")) },
    { label: "Zeile unterhalb einfügen", onSelect: () => run((c) => c.addRow("below")) },
    { label: "Spalte links einfügen", onSelect: () => run((c) => c.addColumn("left")) },
    { label: "Spalte rechts einfügen", onSelect: () => run((c) => c.addColumn("right")) },
  ],
  [
    { label: "Zeile löschen", onSelect: () => run((c) => c.deleteRow()), danger: true },
    { label: "Spalte löschen", onSelect: () => run((c) => c.deleteColumn()), danger: true },
    { label: "Tabelle löschen", onSelect: () => run((c) => c.deleteTable()), danger: true },
  ],
];

export type TableMenuProps = { inTable: boolean; disabled: boolean; commands: TextCommands | null };

/**
 * One button for tables: outside a table it inserts one, inside it offers rows and columns, as the
 * context Word shows changes with the cursor.
 */
export const TableMenu = ({ inTable, disabled, commands }: TableMenuProps) => {
  const { open, toggle, close, ref } = usePopover();
  const insert = (columns: number, rows: number) => {
    commands?.insertTable(columns, rows);
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
            <MenuList
              label="Tabelle bearbeiten"
              groups={tableActions((action) => commands && action(commands))}
              onDone={close}
            />
          ) : (
            <SizeGrid onPick={({ columns, rows }) => insert(columns, rows)} />
          )}
        </div>
      )}
    </div>
  );
};
