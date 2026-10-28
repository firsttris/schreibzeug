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
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Choice } from "./choice";

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

export const BLOCK_LABELS: Record<BlockKind, string> = {
  paragraph: m.text_toolbar_paragraph(),
  h1: m.text_toolbar_heading({ level: 1 }),
  h2: m.text_toolbar_heading({ level: 2 }),
  h3: m.text_toolbar_heading({ level: 3 }),
  h4: m.text_toolbar_heading({ level: 4 }),
  h5: m.text_toolbar_heading({ level: 5 }),
  h6: m.text_toolbar_heading({ level: 6 }),
};

export const MARKS: Array<{ mark: InlineMark; label: string; icon: LucideIcon; shortcut?: string }> = [
  { mark: "strong", label: m.common_bold(), icon: Bold, shortcut: keys("Ctrl+B") },
  { mark: "emphasis", label: m.common_italic(), icon: Italic, shortcut: keys("Ctrl+I") },
  { mark: "strikethrough", label: m.toolbar_strikethrough(), icon: Strikethrough },
  { mark: "code", label: m.text_toolbar_code(), icon: Code },
];

export const PREFIXES: Array<{ prefix: LinePrefix; label: string; icon: LucideIcon }> = [
  { prefix: "bullet", label: m.toolbar_bullets(), icon: List },
  { prefix: "ordered", label: m.toolbar_numbering(), icon: ListOrdered },
  { prefix: "task", label: m.text_toolbar_task_list(), icon: ListTodo },
  { prefix: "quote", label: m.text_toolbar_quote(), icon: Quote },
];

export const VIEW_MODES: Array<{ mode: TextViewMode; label: string }> = [
  { mode: "live", label: m.text_toolbar_live() },
  { mode: "split", label: m.text_toolbar_split() },
  { mode: "source", label: m.text_toolbar_source() },
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
    aria-label={m.toolbar_formatting()}
    className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
  >
    <Button
      variant="ghost"
      aria-label={m.common_undo()}
      disabled={disabled || !state.canUndo}
      onClick={onUndo}
    >
      <Undo2 size={16} />
    </Button>
    <Button
      variant="ghost"
      aria-label={m.common_redo()}
      disabled={disabled || !state.canRedo}
      onClick={onRedo}
    >
      <Redo2 size={16} />
    </Button>
    <Separator />
    <Choice
      label={m.text_toolbar_block()}
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
    <Button variant="ghost" aria-label={m.text_toolbar_link()} disabled={disabled} onClick={onLink}>
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
    <Button variant="ghost" aria-label={m.text_toolbar_table()} disabled={disabled} onClick={onTable}>
      <Table size={16} />
    </Button>
    <Button
      variant="ghost"
      aria-label={m.text_toolbar_rule()}
      disabled={disabled}
      onClick={() => run(TEXT_COMMANDS.rule)}
    >
      <Minus size={16} />
    </Button>
    <fieldset
      aria-label={m.common_view()}
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
