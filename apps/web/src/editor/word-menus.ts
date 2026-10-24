import type { ClipboardAction, EditorState, TextCommands, ViewCommands } from "@stapel/editor-core";
import { tableActions } from "../toolbar/table-menu";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

/** What the menus of the text editor work with; null while the document opens. */
export type WordMenuContext = {
  state: EditorState;
  commands: TextCommands | null;
  view: ViewCommands | null;
  /** The browser refused the clipboard: say which keys to use instead. */
  onClipboardRefused: (action: ClipboardAction) => void;
  onAddComment: () => void;
  onInsertTable: () => void;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onFind: (mode: "find" | "replace") => void;
};

const KEYS: Record<ClipboardAction, string> = { copy: "Strg+C", cut: "Strg+X", paste: "Strg+V" };

/** The hint web-apps gives too when the browser keeps the clipboard from a menu entry. */
export const clipboardHint = (action: ClipboardAction): string =>
  `Der Browser erlaubt das nur über die Tastatur: ${KEYS[action]}.`;

const zoomSteps = [50, 75, 100, 125, 150, 200];

/** Cut, copy, paste: in "Bearbeiten" and in the context menu. */
export const clipboardItems = ({ view, onClipboardRefused }: WordMenuContext): MenuItem[] =>
  (
    [
      ["cut", "Ausschneiden"],
      ["copy", "Kopieren"],
      ["paste", "Einfügen"],
    ] as const
  ).map(([action, label]) => ({
    label,
    shortcut: KEYS[action],
    disabled: !view,
    onSelect: () => {
      if (view && !view.clipboard(action)) onClipboardRefused(action);
    },
  }));

/**
 * Bearbeiten, Ansicht, Einfügen and Format of the text editor, following the menus of the desktop
 * editors in web-apps (documenteditor main: Toolbar.js, ViewTab.js) as far as Stapel has the
 * commands.
 */
export const wordMenus = (context: WordMenuContext): Menu[] => {
  const { state, commands, view } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (commands: TextCommands) => void) => () => commands && action(commands);
  const { text, document } = state;

  return [
    {
      label: "Bearbeiten",
      groups: [
        [
          {
            label: "Rückgängig",
            shortcut: "Strg+Z",
            disabled: off || !document.canUndo,
            onSelect: run((c) => c.undo()),
          },
          {
            label: "Wiederholen",
            shortcut: "Strg+Y",
            disabled: off || !document.canRedo,
            onSelect: run((c) => c.redo()),
          },
        ],
        clipboardItems(context),
        [
          {
            label: "Alles auswählen",
            shortcut: "Strg+A",
            disabled: off,
            onSelect: run((c) => c.selectAll()),
          },
        ],
        [
          { label: "Suchen", shortcut: "Strg+F", disabled: off, onSelect: () => context.onFind("find") },
          {
            label: "Suchen und ersetzen",
            shortcut: "Strg+H",
            disabled: off,
            onSelect: () => context.onFind("replace"),
          },
        ],
      ],
    },
    {
      label: "Ansicht",
      groups: [
        [
          { label: "Vergrößern", disabled: !view, onSelect: () => view?.zoomIn() },
          { label: "Verkleinern", disabled: !view, onSelect: () => view?.zoomOut() },
        ],
        zoomSteps.map((percent) => ({
          label: `${percent} %`,
          checked: document.zoom === percent,
          disabled: !view,
          onSelect: () => view?.setZoom(percent),
        })),
        [
          { label: "Seitenbreite", disabled: !view, onSelect: () => view?.fitWidth() },
          { label: "Ganze Seite", disabled: !view, onSelect: () => view?.fitPage() },
        ],
        [{ label: "Kommentare", checked: context.commentsOpen, onSelect: context.onToggleComments }],
      ],
    },
    {
      label: "Einfügen",
      groups: [
        [
          { label: "Tabelle …", disabled: off, onSelect: context.onInsertTable },
          { label: "Kommentar", disabled: off, onSelect: context.onAddComment },
        ],
        [
          {
            label: "Seitenumbruch",
            shortcut: "Strg+Enter",
            disabled: off,
            onSelect: run((c) => c.insertPageBreak()),
          },
        ],
      ],
    },
    {
      label: "Format",
      groups: [
        [
          {
            label: "Fett",
            shortcut: "Strg+B",
            checked: text.bold,
            disabled: off,
            onSelect: run((c) => c.toggleBold()),
          },
          {
            label: "Kursiv",
            shortcut: "Strg+I",
            checked: text.italic,
            disabled: off,
            onSelect: run((c) => c.toggleItalic()),
          },
          {
            label: "Unterstrichen",
            shortcut: "Strg+U",
            checked: text.underline,
            disabled: off,
            onSelect: run((c) => c.toggleUnderline()),
          },
          {
            label: "Durchgestrichen",
            checked: text.strikeout,
            disabled: off,
            onSelect: run((c) => c.toggleStrikeout()),
          },
          {
            label: "Hochgestellt",
            shortcut: "Strg+,",
            checked: text.baseline === "superscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("superscript")),
          },
          {
            label: "Tiefgestellt",
            shortcut: "Strg+.",
            checked: text.baseline === "subscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("subscript")),
          },
        ],
        [
          {
            label: "Linksbündig",
            shortcut: "Strg+L",
            checked: text.align === "left",
            disabled: off,
            onSelect: run((c) => c.setAlign("left")),
          },
          {
            label: "Zentriert",
            shortcut: "Strg+E",
            checked: text.align === "center",
            disabled: off,
            onSelect: run((c) => c.setAlign("center")),
          },
          {
            label: "Rechtsbündig",
            shortcut: "Strg+R",
            checked: text.align === "right",
            disabled: off,
            onSelect: run((c) => c.setAlign("right")),
          },
          {
            label: "Blocksatz",
            shortcut: "Strg+J",
            checked: text.align === "justify",
            disabled: off,
            onSelect: run((c) => c.setAlign("justify")),
          },
        ],
        [
          {
            label: "Aufzählung",
            checked: state.paragraph.list === "bullet",
            disabled: off,
            onSelect: run((c) => void c.toggleList("bullet")),
          },
          {
            label: "Nummerierung",
            checked: state.paragraph.list === "number",
            disabled: off,
            onSelect: run((c) => void c.toggleList("number")),
          },
        ],
        [
          {
            label: "Formatierung löschen",
            shortcut: "Strg+Leertaste",
            disabled: off,
            onSelect: run((c) => c.clearFormatting()),
          },
        ],
      ],
    },
  ];
};

/**
 * The right-click menu of the text editor: the clipboard, a comment, the table at the cursor, and
 * formatting, as web-apps offers for text (documenteditor main DocumentHolder textMenu, tableMenu).
 */
export const wordContextMenu = (context: WordMenuContext): MenuItem[][] => {
  const { state, commands } = context;
  const run = (action: (commands: TextCommands) => void) => commands && action(commands);
  return [
    clipboardItems(context),
    [{ label: "Kommentar hinzufügen", onSelect: context.onAddComment }],
    ...(state.paragraph.inTable ? tableActions(run) : []),
    [
      { label: "Formatierung löschen", onSelect: () => run((c) => c.clearFormatting()) },
      { label: "Alles auswählen", onSelect: () => run((c) => c.selectAll()) },
    ],
  ];
};
