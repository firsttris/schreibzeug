import {
  type BlockKind,
  type InlineMark,
  type LinePrefix,
  TEXT_COMMANDS,
  type TextCommand,
  type TextEditorState,
  type TextViewMode,
} from "@schreibzeug/text-editor";
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Undo2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Choice } from "./choice";

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

export const BLOCK_LABELS: Record<BlockKind, string> = {
  paragraph: "Absatz",
  h1: "Überschrift 1",
  h2: "Überschrift 2",
  h3: "Überschrift 3",
  h4: "Überschrift 4",
  h5: "Überschrift 5",
  h6: "Überschrift 6",
};

export const MARKS: Array<{ mark: InlineMark; label: string; icon: LucideIcon; shortcut?: string }> = [
  { mark: "strong", label: "Fett", icon: Bold, shortcut: "Strg+B" },
  { mark: "emphasis", label: "Kursiv", icon: Italic, shortcut: "Strg+I" },
  { mark: "strikethrough", label: "Durchgestrichen", icon: Strikethrough },
  { mark: "code", label: "Code", icon: Code },
];

export const PREFIXES: Array<{ prefix: LinePrefix; label: string; icon: LucideIcon }> = [
  { prefix: "bullet", label: "Aufzählung", icon: List },
  { prefix: "ordered", label: "Nummerierung", icon: ListOrdered },
  { prefix: "task", label: "Aufgabenliste", icon: ListTodo },
  { prefix: "quote", label: "Zitat", icon: Quote },
];

export const VIEW_MODES: Array<{ mode: TextViewMode; label: string }> = [
  { mode: "live", label: "Live" },
  { mode: "split", label: "Geteilt" },
  { mode: "source", label: "Quelltext" },
];

export type TextToolbarProps = {
  state: TextEditorState;
  disabled: boolean;
  mode: TextViewMode;
  onMode: (mode: TextViewMode) => void;
  run: (command: TextCommand) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLink: () => void;
  onTable: () => void;
};

/**
 * The row above a Markdown note: it writes Markdown into the text, as typing the marks would, and
 * switches between the live view, source and preview side by side, and source alone.
 */
export const TextToolbar = ({
  state,
  disabled,
  mode,
  onMode,
  run,
  onUndo,
  onRedo,
  onLink,
  onTable,
}: TextToolbarProps) => (
  <div
    role="toolbar"
    aria-label="Formatierung"
    className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
  >
    <Button variant="ghost" aria-label="Rückgängig" disabled={disabled || !state.canUndo} onClick={onUndo}>
      <Undo2 size={16} />
    </Button>
    <Button variant="ghost" aria-label="Wiederholen" disabled={disabled || !state.canRedo} onClick={onRedo}>
      <Redo2 size={16} />
    </Button>
    <Separator />
    <Choice
      label="Absatzart"
      value={state.block}
      options={(Object.keys(BLOCK_LABELS) as BlockKind[])
        .slice(0, 4)
        .map((value) => ({ value, label: BLOCK_LABELS[value] }))}
      disabled={disabled}
      onChange={(value) => run(TEXT_COMMANDS.block(value as BlockKind))}
      className="w-36"
    />
    <Separator />
    {MARKS.map(({ mark, label, icon: Icon, shortcut }) => (
      <Button
        key={mark}
        variant="toggle"
        aria-label={label}
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-pressed={state.marks.includes(mark)}
        disabled={disabled}
        onClick={() => run(TEXT_COMMANDS.inline(mark))}
      >
        <Icon size={16} />
      </Button>
    ))}
    <Button variant="ghost" aria-label="Link" disabled={disabled} onClick={onLink}>
      <Link size={16} />
    </Button>
    <Separator />
    {PREFIXES.map(({ prefix, label, icon: Icon }) => (
      <Button
        key={prefix}
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        onClick={() => run(TEXT_COMMANDS.prefix(prefix))}
      >
        <Icon size={16} />
      </Button>
    ))}
    <Button variant="ghost" aria-label="Tabelle" disabled={disabled} onClick={onTable}>
      <Table size={16} />
    </Button>
    <Button
      variant="ghost"
      aria-label="Trennlinie"
      disabled={disabled}
      onClick={() => run(TEXT_COMMANDS.rule)}
    >
      <Minus size={16} />
    </Button>
    <fieldset
      aria-label="Ansicht"
      className="m-0 ml-auto flex overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] p-0"
    >
      {VIEW_MODES.map((entry) => (
        <button
          key={entry.mode}
          type="button"
          aria-pressed={mode === entry.mode}
          onClick={() => onMode(entry.mode)}
          className={`h-7 border-l border-[var(--border)] px-3 text-xs first:border-l-0 ${
            mode === entry.mode
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {entry.label}
        </button>
      ))}
    </fieldset>
  </div>
);
