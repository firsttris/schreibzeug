import type { Align, CellCommands, DataCommands, NumberFormat, SheetState } from "@schreibzeug/editor-core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  Bold,
  ChartColumn,
  Columns3,
  Funnel,
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
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { MenuButton, type MenuItem } from "../ui/menu";
import { Choice } from "./choice";
import { ColorPicker } from "./color-picker";

const aligns: Array<{ value: Align; label: string; icon: LucideIcon }> = [
  { value: "left", label: m.toolbar_align_left(), icon: AlignLeft },
  { value: "center", label: m.toolbar_align_center(), icon: AlignCenter },
  { value: "right", label: m.toolbar_align_right(), icon: AlignRight },
];

/** The number formats in the words of German Excel. */
export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  general: m.sheet_toolbar_general(),
  number: m.sheet_toolbar_number(),
  currency: m.sheet_toolbar_currency(),
  percent: m.sheet_toolbar_percent(),
  date: m.sheet_toolbar_date(),
  text: m.sheet_toolbar_text(),
};

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

type Toggle = { label: string; icon: LucideIcon; pressed: boolean; run: () => void };

const ToggleButton = ({ label, icon: Icon, pressed, run, disabled }: Toggle & { disabled: boolean }) => (
  <Button variant="toggle" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={run}>
    <Icon size={16} />
  </Button>
);

export type SheetToolbarProps = {
  state: SheetState;
  commands: CellCommands | null;
  data: DataCommands | null;
  /** A chart of the selection, or the selected chart's kind (sheet-menus.ts chartItems). */
  chartItems: MenuItem[];
};

/** The formatting row above the grid: every control reads SheetState and calls a cell command. */
export const SheetToolbar = ({ state, commands, data, chartItems }: SheetToolbarProps) => {
  const disabled = !commands || state.status !== "ready";
  const { cell, document, fonts } = state;
  const fontSize = cell.fontSize ?? 11;
  const run = (command: (commands: CellCommands) => void) => () => commands && command(commands);

  const marks: Toggle[] = [
    { label: m.common_bold(), icon: Bold, pressed: cell.bold, run: run((c) => c.toggleBold()) },
    { label: m.common_italic(), icon: Italic, pressed: cell.italic, run: run((c) => c.toggleItalic()) },
    {
      label: m.common_underline(),
      icon: Underline,
      pressed: cell.underline,
      run: run((c) => c.toggleUnderline()),
    },
    {
      label: m.toolbar_strikethrough(),
      icon: Strikethrough,
      pressed: cell.strikeout,
      run: run((c) => c.toggleStrikeout()),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label={m.toolbar_formatting()}
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
    >
      <Button
        variant="ghost"
        aria-label={m.common_undo()}
        disabled={disabled || !document.canUndo}
        onClick={run((c) => c.undo())}
      >
        <Undo2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label={m.common_redo()}
        disabled={disabled || !document.canRedo}
        onClick={run((c) => c.redo())}
      >
        <Redo2 size={16} />
      </Button>
      <Separator />
      <Choice
        label={m.toolbar_font()}
        className="w-40"
        value={cell.fontName}
        options={fonts.map((name) => ({ value: name, label: name }))}
        disabled={disabled}
        onChange={(name) => commands?.setFontName(name)}
      />
      <div className="ml-1 flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--background)]">
        <Button
          variant="ghost"
          aria-label={m.toolbar_font_smaller()}
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
          aria-label={m.toolbar_font_larger()}
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
        label={m.sheet_toolbar_wrap()}
        icon={WrapText}
        pressed={cell.wrap}
        run={run((c) => c.toggleWrap())}
        disabled={disabled}
      />
      <ToggleButton
        label={m.sheet_toolbar_merge()}
        icon={Merge}
        pressed={cell.merged}
        run={run((c) => c.toggleMerge())}
        disabled={disabled || (!cell.mergeable && !cell.merged)}
      />
      <Separator />
      <Choice
        label={m.sheet_toolbar_number_format()}
        className="w-32"
        value={cell.numberFormat === "custom" ? m.sheet_toolbar_custom() : cell.numberFormat}
        options={Object.entries(NUMBER_FORMAT_LABELS).map(([value, label]) => ({ value, label }))}
        disabled={disabled}
        onChange={(format) => commands?.setNumberFormat(format as NumberFormat)}
      />
      <Separator />
      <MenuButton
        label={m.sheet_toolbar_sort()}
        variant="ghost"
        disabled={disabled || !data}
        groups={[
          [
            { label: m.sheet_toolbar_sort_ascending(), onSelect: () => data?.sort("ascending") },
            { label: m.sheet_toolbar_sort_descending(), onSelect: () => data?.sort("descending") },
          ],
        ]}
      >
        <ArrowDownAZ size={16} />
      </MenuButton>
      <MenuButton label={m.sheet_toolbar_chart()} variant="ghost" disabled={disabled} groups={[chartItems]}>
        <ChartColumn size={16} />
      </MenuButton>
      <ToggleButton
        label={m.sheet_toolbar_filter()}
        icon={Funnel}
        pressed={state.data.filter.on}
        run={() => data?.toggleFilter()}
        disabled={disabled || !data || !state.data.filter.available}
      />
      <Separator />
      <MenuButton
        label={m.sheet_toolbar_rows()}
        variant="ghost"
        disabled={disabled}
        groups={[
          [{ label: m.sheet_toolbar_insert_row(), onSelect: run((c) => c.insertRows()) }],
          [{ label: m.sheet_toolbar_delete_row(), onSelect: run((c) => c.deleteRows()), danger: true }],
        ]}
      >
        <Rows3 size={16} />
      </MenuButton>
      <MenuButton
        label={m.sheet_toolbar_columns()}
        variant="ghost"
        disabled={disabled}
        groups={[
          [{ label: m.sheet_toolbar_insert_column(), onSelect: run((c) => c.insertColumns()) }],
          [{ label: m.sheet_toolbar_delete_column(), onSelect: run((c) => c.deleteColumns()), danger: true }],
        ]}
      >
        <Columns3 size={16} />
      </MenuButton>
    </div>
  );
};
