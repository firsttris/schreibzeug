import type { Align, CellCommands, NumberFormat, SheetState } from "@stapel/editor-core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Italic,
  type LucideIcon,
  Merge,
  Minus,
  Plus,
  Redo2,
  Rows3,
  Strikethrough,
  Underline,
  Undo2,
  WrapText,
} from "lucide-react";
import { Button } from "../ui/button";
import { MenuButton } from "../ui/menu";
import { Choice } from "./choice";
import { ColorPicker } from "./color-picker";

const aligns: Array<{ value: Align; label: string; icon: LucideIcon }> = [
  { value: "left", label: "Linksbündig", icon: AlignLeft },
  { value: "center", label: "Zentriert", icon: AlignCenter },
  { value: "right", label: "Rechtsbündig", icon: AlignRight },
];

/** The number formats in the words of German Excel. */
export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  general: "Standard",
  number: "Zahl",
  currency: "Währung",
  percent: "Prozent",
  date: "Datum",
  text: "Text",
};

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

type Toggle = { label: string; icon: LucideIcon; pressed: boolean; run: () => void };

const ToggleButton = ({ label, icon: Icon, pressed, run, disabled }: Toggle & { disabled: boolean }) => (
  <Button variant="toggle" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={run}>
    <Icon size={16} />
  </Button>
);

export type SheetToolbarProps = { state: SheetState; commands: CellCommands | null };

/** The formatting row above the grid: every control reads SheetState and calls a cell command. */
export const SheetToolbar = ({ state, commands }: SheetToolbarProps) => {
  const disabled = !commands || state.status !== "ready";
  const { cell, document, fonts } = state;
  const fontSize = cell.fontSize ?? 11;
  const run = (command: (commands: CellCommands) => void) => () => commands && command(commands);

  const marks: Toggle[] = [
    { label: "Fett", icon: Bold, pressed: cell.bold, run: run((c) => c.toggleBold()) },
    { label: "Kursiv", icon: Italic, pressed: cell.italic, run: run((c) => c.toggleItalic()) },
    {
      label: "Unterstrichen",
      icon: Underline,
      pressed: cell.underline,
      run: run((c) => c.toggleUnderline()),
    },
    {
      label: "Durchgestrichen",
      icon: Strikethrough,
      pressed: cell.strikeout,
      run: run((c) => c.toggleStrikeout()),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Formatierung"
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
    >
      <Button
        variant="ghost"
        aria-label="Rückgängig"
        disabled={disabled || !document.canUndo}
        onClick={run((c) => c.undo())}
      >
        <Undo2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Wiederholen"
        disabled={disabled || !document.canRedo}
        onClick={run((c) => c.redo())}
      >
        <Redo2 size={16} />
      </Button>
      <Separator />
      <Choice
        label="Schriftart"
        className="w-40"
        value={cell.fontName}
        options={fonts.map((name) => ({ value: name, label: name }))}
        disabled={disabled}
        onChange={(name) => commands?.setFontName(name)}
      />
      <div className="ml-1 flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--background)]">
        <Button
          variant="ghost"
          aria-label="Schrift verkleinern"
          disabled={disabled}
          onClick={run((c) => c.setFontSize(fontSize - 1))}
        >
          <Minus size={14} />
        </Button>
        <span data-testid="font-size" className="w-9 text-center font-mono text-sm tabular-nums">
          {cell.fontSize ?? "–"}
        </span>
        <Button
          variant="ghost"
          aria-label="Schrift vergrößern"
          disabled={disabled}
          onClick={run((c) => c.setFontSize(fontSize + 1))}
        >
          <Plus size={14} />
        </Button>
      </div>
      <Separator />
      {marks.map((toggle) => (
        <ToggleButton key={toggle.label} {...toggle} disabled={disabled} />
      ))}
      <ColorPicker color={cell.color} disabled={disabled} onPick={(color) => commands?.setColor(color)} />
      <ColorPicker
        target="fill"
        color={cell.fill}
        disabled={disabled}
        onPick={(color) => commands?.setFill(color)}
      />
      <Separator />
      {aligns.map(({ value, label, icon }) => (
        <ToggleButton
          key={value}
          label={label}
          icon={icon}
          pressed={cell.align === value}
          run={run((c) => c.setAlign(value))}
          disabled={disabled}
        />
      ))}
      <ToggleButton
        label="Zeilenumbruch"
        icon={WrapText}
        pressed={cell.wrap}
        run={run((c) => c.toggleWrap())}
        disabled={disabled}
      />
      <ToggleButton
        label="Zellen verbinden"
        icon={Merge}
        pressed={cell.merged}
        run={run((c) => c.toggleMerge())}
        disabled={disabled || (!cell.mergeable && !cell.merged)}
      />
      <Separator />
      <Choice
        label="Zahlenformat"
        className="w-32"
        value={cell.numberFormat === "custom" ? "Benutzerdefiniert" : cell.numberFormat}
        options={Object.entries(NUMBER_FORMAT_LABELS).map(([value, label]) => ({ value, label }))}
        disabled={disabled}
        onChange={(format) => commands?.setNumberFormat(format as NumberFormat)}
      />
      <Separator />
      <MenuButton
        label="Zeilen"
        variant="ghost"
        disabled={disabled}
        groups={[
          [{ label: "Zeile einfügen", onSelect: run((c) => c.insertRows()) }],
          [{ label: "Zeile löschen", onSelect: run((c) => c.deleteRows()), danger: true }],
        ]}
      >
        <Rows3 size={16} />
      </MenuButton>
      <MenuButton
        label="Spalten"
        variant="ghost"
        disabled={disabled}
        groups={[
          [{ label: "Spalte einfügen", onSelect: run((c) => c.insertColumns()) }],
          [{ label: "Spalte löschen", onSelect: run((c) => c.deleteColumns()), danger: true }],
        ]}
      >
        <Columns3 size={16} />
      </MenuButton>
    </div>
  );
};
