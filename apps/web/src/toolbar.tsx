import type { Align, EditorState, TextCommands } from "@stapel/editor-core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  type LucideIcon,
  Minus,
  Plus,
  Redo2,
  TextSelect,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "./ui/button";

const aligns: Array<{ value: Align; label: string; icon: LucideIcon }> = [
  { value: "left", label: "Linksbündig", icon: AlignLeft },
  { value: "center", label: "Zentriert", icon: AlignCenter },
  { value: "right", label: "Rechtsbündig", icon: AlignRight },
  { value: "justify", label: "Blocksatz", icon: AlignJustify },
];

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

export type ToolbarProps = { state: EditorState; commands: TextCommands | null };

export const Toolbar = ({ state, commands }: ToolbarProps) => {
  const disabled = !commands || state.status !== "ready";
  const { text, document } = state;
  const fontSize = text.fontSize ?? 11;

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
        onClick={commands?.undo}
      >
        <Undo2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Wiederholen"
        disabled={disabled || !document.canRedo}
        onClick={commands?.redo}
      >
        <Redo2 size={16} />
      </Button>
      <Button variant="ghost" aria-label="Alles auswählen" disabled={disabled} onClick={commands?.selectAll}>
        <TextSelect size={16} />
      </Button>
      <Separator />
      <div className="flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--background)]">
        <Button
          variant="ghost"
          aria-label="Schrift verkleinern"
          disabled={disabled}
          onClick={() => commands?.setFontSize(fontSize - 1)}
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
          onClick={() => commands?.setFontSize(fontSize + 1)}
        >
          <Plus size={14} />
        </Button>
      </div>
      <Separator />
      <Button
        variant="toggle"
        aria-label="Fett"
        aria-pressed={text.bold}
        disabled={disabled}
        onClick={commands?.toggleBold}
      >
        <Bold size={16} />
      </Button>
      <Button
        variant="toggle"
        aria-label="Kursiv"
        aria-pressed={text.italic}
        disabled={disabled}
        onClick={commands?.toggleItalic}
      >
        <Italic size={16} />
      </Button>
      <Button
        variant="toggle"
        aria-label="Unterstrichen"
        aria-pressed={text.underline}
        disabled={disabled}
        onClick={commands?.toggleUnderline}
      >
        <Underline size={16} />
      </Button>
      <Separator />
      {aligns.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant="toggle"
          aria-label={label}
          aria-pressed={text.align === value}
          disabled={disabled}
          onClick={() => commands?.setAlign(value)}
        >
          <Icon size={16} />
        </Button>
      ))}
    </div>
  );
};
