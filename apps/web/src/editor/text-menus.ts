import {
  type BlockKind,
  TEXT_COMMANDS,
  type TextCommand,
  type TextEditorState,
  type TextViewMode,
} from "@schreibzeug/text-editor";
import { BLOCK_LABELS, MARKS, PREFIXES, VIEW_MODES } from "../toolbar/text-toolbar";
import type { Menu } from "../ui/menu-bar";
import type { Shortcut } from "./help-dialogs";

export type TextMenuContext = {
  state: TextEditorState;
  markdown: boolean;
  /** Opened to look at only: no menus that change the text. */
  readOnly: boolean;
  mode: TextViewMode;
  onMode: (mode: TextViewMode) => void;
  run: (command: TextCommand) => void;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onLink: () => void;
  onTable: () => void;
};

const HEADINGS: BlockKind[] = ["paragraph", "h1", "h2", "h3"];

const VIEW_MENU_LABEL: Record<TextViewMode, string> = {
  live: "Live-Vorschau",
  split: "Quelltext und Vorschau",
  source: "Nur Quelltext",
};

/** Bearbeiten, Ansicht, Einfügen and Format of a text file; a plain text file has only Bearbeiten. */
export const textMenus = (context: TextMenuContext): Menu[] => {
  const { state, markdown, readOnly, run } = context;
  const edit: Menu = {
    label: "Bearbeiten",
    groups: [
      readOnly
        ? []
        : [
            { label: "Rückgängig", shortcut: "Strg+Z", disabled: !state.canUndo, onSelect: context.onUndo },
            { label: "Wiederholen", shortcut: "Strg+Y", disabled: !state.canRedo, onSelect: context.onRedo },
          ],
      [{ label: readOnly ? "Suchen" : "Suchen und ersetzen", shortcut: "Strg+F", onSelect: context.onFind }],
    ],
  };
  if (!markdown) return [edit];
  const view: Menu = {
    label: "Ansicht",
    groups: [
      VIEW_MODES.map(({ mode }) => ({
        label: VIEW_MENU_LABEL[mode],
        checked: context.mode === mode,
        onSelect: () => context.onMode(mode),
      })),
    ],
  };
  if (readOnly) return [edit, view];
  const insert: Menu = {
    label: "Einfügen",
    groups: [
      [
        { label: "Link …", onSelect: context.onLink },
        { label: "Tabelle …", onSelect: context.onTable },
        { label: "Trennlinie", onSelect: () => run(TEXT_COMMANDS.rule) },
      ],
    ],
  };
  const format: Menu = {
    label: "Format",
    groups: [
      MARKS.map(({ mark, label, shortcut }) => ({
        label,
        ...(shortcut ? { shortcut } : {}),
        checked: state.marks.includes(mark),
        onSelect: () => run(TEXT_COMMANDS.inline(mark)),
      })),
      HEADINGS.map((block) => ({
        label: BLOCK_LABELS[block],
        checked: state.block === block,
        onSelect: () => run(TEXT_COMMANDS.block(block)),
      })),
      PREFIXES.map(({ prefix, label }) => ({ label, onSelect: () => run(TEXT_COMMANDS.prefix(prefix)) })),
    ],
  };
  return [edit, view, insert, format];
};

/** Keys of the text editor (CodeMirror's default keymap and editor.ts). */
export const TEXT_SHORTCUTS: Shortcut[] = [
  { keys: "Strg+Z", label: "Rückgängig" },
  { keys: "Strg+Y / Strg+Umschalt+Z", label: "Wiederholen" },
  { keys: "Strg+X / C / V", label: "Ausschneiden, Kopieren, Einfügen" },
  { keys: "Strg+A", label: "Alles auswählen" },
  { keys: "Strg+F", label: "Suchen und ersetzen" },
  { keys: "Strg+S", label: "Speichern" },
  { keys: "Strg+B", label: "Fett (Markdown)" },
  { keys: "Strg+I", label: "Kursiv (Markdown)" },
  { keys: "Tab / Umschalt+Tab", label: "Einrücken, Ausrücken" },
];
