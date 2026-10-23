import type { Align, EditorState, TextCommands } from "@stapel/editor-core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  Minus,
  Plus,
  Redo2,
  Strikethrough,
  TextSelect,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Choice } from "./choice";
import { ColorPicker } from "./color-picker";
import { styleLabel } from "./style-labels";

const aligns: Array<{ value: Align; label: string; icon: LucideIcon }> = [
  { value: "left", label: "Linksbündig", icon: AlignLeft },
  { value: "center", label: "Zentriert", icon: AlignCenter },
  { value: "right", label: "Rechtsbündig", icon: AlignRight },
  { value: "justify", label: "Blocksatz", icon: AlignJustify },
];

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

type Toggle = { label: string; icon: LucideIcon; pressed: boolean; run: () => void };

const ToggleButton = ({ label, icon: Icon, pressed, run, disabled }: Toggle & { disabled: boolean }) => (
  <Button variant="toggle" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={run}>
    <Icon size={16} />
  </Button>
);

export type ToolbarProps = { state: EditorState; commands: TextCommands | null };

/** The formatting row above the document: every control reads EditorState and calls a command. */
export const Toolbar = ({ state, commands }: ToolbarProps) => {
  const disabled = !commands || state.status !== "ready";
  const { text, paragraph, catalog, document } = state;
  const fontSize = text.fontSize ?? 11;
  const run = (command: (commands: TextCommands) => void) => () => commands && command(commands);

  const marks: Toggle[] = [
    { label: "Fett", icon: Bold, pressed: text.bold, run: run((c) => c.toggleBold()) },
    { label: "Kursiv", icon: Italic, pressed: text.italic, run: run((c) => c.toggleItalic()) },
    {
      label: "Unterstrichen",
      icon: Underline,
      pressed: text.underline,
      run: run((c) => c.toggleUnderline()),
    },
    {
      label: "Durchgestrichen",
      icon: Strikethrough,
      pressed: text.strikeout,
      run: run((c) => c.toggleStrikeout()),
    },
  ];
  const lists: Toggle[] = [
    {
      label: "Aufzählung",
      icon: List,
      pressed: paragraph.list === "bullet",
      run: run((c) => c.toggleList("bullet")),
    },
    {
      label: "Nummerierung",
      icon: ListOrdered,
      pressed: paragraph.list === "number",
      run: run((c) => c.toggleList("number")),
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
        label="Absatzvorlage"
        className="w-40"
        value={paragraph.style}
        options={catalog.styles.map((name) => ({ value: name, label: styleLabel(name) }))}
        disabled={disabled}
        onChange={(name) => commands?.setStyle(name)}
      />
      <Choice
        label="Schriftart"
        className="ml-1 w-40"
        value={text.fontName}
        options={catalog.fonts.map((name) => ({ value: name, label: name }))}
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
          {text.fontSize ?? "–"}
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
      <ColorPicker color={text.color} disabled={disabled} onPick={(color) => commands?.setColor(color)} />
      <Separator />
      {lists.map((toggle) => (
        <ToggleButton key={toggle.label} {...toggle} disabled={disabled} />
      ))}
      <Separator />
      {aligns.map(({ value, label, icon }) => (
        <ToggleButton
          key={value}
          label={label}
          icon={icon}
          pressed={text.align === value}
          run={run((c) => c.setAlign(value))}
          disabled={disabled}
        />
      ))}
      <Separator />
      <Button
        variant="ghost"
        aria-label="Alles auswählen"
        disabled={disabled}
        onClick={run((c) => c.selectAll())}
      >
        <TextSelect size={16} />
      </Button>
    </div>
  );
};
