import {
  type BlockKind,
  TEXT_COMMANDS,
  type TextCommand,
  type TextEditorState,
  type TextViewMode,
} from "@schreibzeug/text-editor";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
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

const VIEW_MENU_LABEL: Record<TextViewMode, () => string> = {
  live: m.text_menus_view_live,
  split: m.text_menus_view_split,
  source: m.text_menus_view_source,
};

/** Bearbeiten, Ansicht, Einfügen and Format of a text file; a plain text file has only Bearbeiten. */
export const textMenus = (context: TextMenuContext): Menu[] => {
  const { state, markdown, readOnly, run } = context;
  const edit: Menu = {
    label: m.common_edit(),
    groups: [
      readOnly
        ? []
        : [
            {
              label: m.common_undo(),
              shortcut: keys("Ctrl+Z"),
              disabled: !state.canUndo,
              onSelect: context.onUndo,
            },
            {
              label: m.common_redo(),
              shortcut: keys("Ctrl+Y"),
              disabled: !state.canRedo,
              onSelect: context.onRedo,
            },
          ],
      [
        {
          label: readOnly ? m.common_find() : m.text_menus_find_replace(),
          shortcut: keys("Ctrl+F"),
          onSelect: context.onFind,
        },
      ],
    ],
  };
  if (!markdown) return [edit];
  const view: Menu = {
    label: m.common_view(),
    groups: [
      VIEW_MODES.map(({ mode }) => ({
        label: VIEW_MENU_LABEL[mode](),
        checked: context.mode === mode,
        onSelect: () => context.onMode(mode),
      })),
    ],
  };
  if (readOnly) return [edit, view];
  const insert: Menu = {
    label: m.common_insert(),
    groups: [
      [
        { label: m.text_menus_link(), onSelect: context.onLink },
        { label: m.text_menus_table(), onSelect: context.onTable },
        { label: m.text_menus_rule(), onSelect: () => run(TEXT_COMMANDS.rule) },
      ],
    ],
  };
  const format: Menu = {
    label: m.common_format(),
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
  { keys: keys("Ctrl+Z"), label: m.common_undo() },
  { keys: keys("Ctrl+Y / Ctrl+Shift+Z"), label: m.common_redo() },
  { keys: keys("Ctrl+X / C / V"), label: m.text_menus_shortcut_clipboard() },
  { keys: keys("Ctrl+A"), label: m.common_select_all() },
  { keys: keys("Ctrl+F"), label: m.text_menus_find_replace() },
  { keys: keys("Ctrl+S"), label: m.common_save() },
  { keys: keys("Ctrl+B"), label: m.text_menus_shortcut_bold() },
  { keys: keys("Ctrl+I"), label: m.text_menus_shortcut_italic() },
  { keys: keys("Tab / Shift+Tab"), label: m.text_menus_shortcut_indent() },
];
