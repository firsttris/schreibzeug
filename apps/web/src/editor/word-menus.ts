import type {
  ClipboardAction,
  EditorState,
  HeaderFooterCommands,
  LayoutCommands,
  LinkCommands,
  TextCommands,
  ViewCommands,
} from "@stapel/editor-core";
import { tableActions } from "../toolbar/table-menu";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";
import { clipboardItems, searchItems, zoomGroups } from "./common-menus";
import { headerFooterGroups } from "./header-footer-menus";
import { layoutMenu, paragraphSpacingGroups } from "./layout-menus";

/** What the menus of the text editor work with; null while the document opens. */
export type WordMenuContext = {
  state: EditorState;
  commands: TextCommands | null;
  layout: LayoutCommands | null;
  headerFooter: HeaderFooterCommands | null;
  links: LinkCommands | null;
  /** Opens the link dialog for the selection or the link at the cursor. */
  onLink: () => void;
  /** Opens an address in a new tab. */
  onOpenLink: (url: string) => void;
  view: ViewCommands | null;
  /** The browser refused the clipboard: say which keys to use instead. */
  onClipboardRefused: (action: ClipboardAction) => void;
  onAddComment: () => void;
  onInsertTable: () => void;
  /** Opens the file dialog for an image; null where none can be put in. */
  onInsertImage: (() => void) | null;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onFind: (mode: "find" | "replace") => void;
};

/**
 * Bearbeiten, Ansicht, Einfügen, Layout and Format of the text editor, following the menus of the desktop
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
        clipboardItems(view, context.onClipboardRefused),
        [
          {
            label: "Alles auswählen",
            shortcut: "Strg+A",
            disabled: off,
            onSelect: run((c) => c.selectAll()),
          },
        ],
        searchItems(context.onFind, off),
      ],
    },
    {
      label: "Ansicht",
      groups: [
        ...zoomGroups(view, document.zoom),
        [{ label: "Kommentare", checked: context.commentsOpen, onSelect: context.onToggleComments }],
      ],
    },
    {
      label: "Einfügen",
      groups: [
        [
          { label: "Tabelle …", disabled: off, onSelect: context.onInsertTable },
          { label: "Link …", shortcut: "Strg+K", disabled: off, onSelect: context.onLink },
          {
            label: "Bild …",
            disabled: off || !context.onInsertImage,
            onSelect: () => context.onInsertImage?.(),
          },
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
        ...headerFooterGroups(context.headerFooter, state.paragraph.inHeaderFooter, off),
      ],
    },
    layoutMenu(state.page, context.layout, off),
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
        ...paragraphSpacingGroups(state.paragraph.lineSpacing, context.layout, off),
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

/** Inside a link: edit, open or remove it; elsewhere: make one (DocumentHolder hyperlinkMenu). */
const linkItems = ({ state, links, onLink, onOpenLink }: WordMenuContext): MenuItem[] => {
  const { link } = state.paragraph;
  if (!link) return [{ label: "Link …", onSelect: onLink }];
  return [
    { label: "Link bearbeiten …", onSelect: onLink },
    { label: "Link öffnen", onSelect: () => onOpenLink(link.url) },
    { label: "Link entfernen", onSelect: () => links?.remove() },
  ];
};

/**
 * The right-click menu of the text editor: the clipboard, a comment, the table at the cursor, and
 * formatting, as web-apps offers for text (documenteditor main DocumentHolder textMenu, tableMenu).
 */
export const wordContextMenu = (context: WordMenuContext): MenuItem[][] => {
  const { state, commands, view } = context;
  const run = (action: (commands: TextCommands) => void) => commands && action(commands);
  return [
    clipboardItems(view, context.onClipboardRefused),
    state.paragraph.inHeaderFooter
      ? [{ label: "Kopf- und Fußzeile schließen", onSelect: () => context.headerFooter?.close() }]
      : [{ label: "Kommentar hinzufügen", onSelect: context.onAddComment }],
    linkItems(context),
    ...(state.paragraph.inTable ? tableActions(run) : []),
    [
      { label: "Formatierung löschen", onSelect: () => run((c) => c.clearFormatting()) },
      { label: "Alles auswählen", onSelect: () => run((c) => c.selectAll()) },
    ],
  ];
};
