import type {
  ClipboardAction,
  EditorState,
  HeaderFooterCommands,
  InsertCommands,
  LayoutCommands,
  LinkCommands,
  ReviewCommands,
  SpellingCommands,
  TextCommands,
  ViewCommands,
} from "@schreibzeug/editor-core";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import { tableActions } from "../toolbar/table-menu";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";
import { clipboardItems, searchItems, zoomGroups } from "./common-menus";
import { headerFooterGroups } from "./header-footer-menus";
import { insertGroups } from "./insert-menus";
import { layoutMenu, paragraphSpacingGroups } from "./layout-menus";
import { type MailMergeMenuContext, mailMergeMenu } from "./mail-merge-menu";
import { reviewMenu } from "./review-menus";
import { spellCheckItem, suggestionGroups } from "./spelling-menus";

/** What the menus of the text editor work with; null while the document opens. */
export type WordMenuContext = {
  state: EditorState;
  commands: TextCommands | null;
  layout: LayoutCommands | null;
  headerFooter: HeaderFooterCommands | null;
  insert: InsertCommands | null;
  links: LinkCommands | null;
  review: ReviewCommands | null;
  spelling: SpellingCommands | null;
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
  /** The text in the width of the screen instead of pages (use-mobile-view.ts). */
  mobileView: { on: boolean; toggle: () => void };
  onFind: (mode: "find" | "replace") => void;
  /** Says something in the editor's notice line. */
  onNotice: (message: string) => void;
  mailMerge: MailMergeMenuContext;
};

/**
 * Bearbeiten, Ansicht, Einfügen, Layout, Format and Überprüfen of the text editor, following the menus of the desktop
 * editors in web-apps (documenteditor main: Toolbar.js, ViewTab.js) as far as Schreibzeug has the
 * commands.
 */
export const wordMenus = (context: WordMenuContext): Menu[] => {
  const { state, commands, view } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (commands: TextCommands) => void) => () => commands && action(commands);
  const { text, document } = state;

  return [
    {
      label: m.common_edit(),
      groups: [
        [
          {
            label: m.common_undo(),
            shortcut: keys("Ctrl+Z"),
            disabled: off || !document.canUndo,
            onSelect: run((c) => c.undo()),
          },
          {
            label: m.common_redo(),
            shortcut: keys("Ctrl+Y"),
            disabled: off || !document.canRedo,
            onSelect: run((c) => c.redo()),
          },
        ],
        clipboardItems(view, context.onClipboardRefused),
        [
          {
            label: m.common_select_all(),
            shortcut: keys("Ctrl+A"),
            disabled: off,
            onSelect: run((c) => c.selectAll()),
          },
        ],
        searchItems(context.onFind, off),
      ],
    },
    {
      label: m.common_view(),
      groups: [
        ...zoomGroups(view, document.zoom),
        [
          {
            label: m.word_menus_mobile_view(),
            checked: context.mobileView.on,
            onSelect: context.mobileView.toggle,
          },
          {
            label: m.word_menus_comments(),
            checked: context.commentsOpen,
            onSelect: context.onToggleComments,
          },
        ],
      ],
    },
    {
      label: m.common_insert(),
      groups: [
        [
          { label: m.word_menus_table(), disabled: off, onSelect: context.onInsertTable },
          { label: m.word_menus_link(), shortcut: keys("Ctrl+K"), disabled: off, onSelect: context.onLink },
          {
            label: m.word_menus_image(),
            disabled: off || !context.onInsertImage,
            onSelect: () => context.onInsertImage?.(),
          },
          {
            label: m.word_menus_text_box(),
            disabled: off || !context.insert,
            onSelect: () => context.insert?.textBox(),
          },
          { label: m.word_menus_comment(), disabled: off, onSelect: context.onAddComment },
        ],
        ...insertGroups(
          context.insert,
          run((c) => c.insertPageBreak()),
          off,
          context.onNotice,
        ),
        ...headerFooterGroups(context.headerFooter, state.paragraph.inHeaderFooter, off),
      ],
    },
    layoutMenu(state.page, context.layout, off),
    {
      label: m.common_format(),
      groups: [
        [
          {
            label: m.common_bold(),
            shortcut: keys("Ctrl+B"),
            checked: text.bold,
            disabled: off,
            onSelect: run((c) => c.toggleBold()),
          },
          {
            label: m.common_italic(),
            shortcut: keys("Ctrl+I"),
            checked: text.italic,
            disabled: off,
            onSelect: run((c) => c.toggleItalic()),
          },
          {
            label: m.common_underline(),
            shortcut: keys("Ctrl+U"),
            checked: text.underline,
            disabled: off,
            onSelect: run((c) => c.toggleUnderline()),
          },
          {
            label: m.word_menus_strikeout(),
            checked: text.strikeout,
            disabled: off,
            onSelect: run((c) => c.toggleStrikeout()),
          },
          {
            label: m.word_menus_superscript(),
            shortcut: keys("Ctrl+,"),
            checked: text.baseline === "superscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("superscript")),
          },
          {
            label: m.word_menus_subscript(),
            shortcut: keys("Ctrl+."),
            checked: text.baseline === "subscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("subscript")),
          },
        ],
        [
          {
            label: m.word_menus_align_left(),
            shortcut: keys("Ctrl+L"),
            checked: text.align === "left",
            disabled: off,
            onSelect: run((c) => c.setAlign("left")),
          },
          {
            label: m.word_menus_align_center(),
            shortcut: keys("Ctrl+E"),
            checked: text.align === "center",
            disabled: off,
            onSelect: run((c) => c.setAlign("center")),
          },
          {
            label: m.word_menus_align_right(),
            shortcut: keys("Ctrl+R"),
            checked: text.align === "right",
            disabled: off,
            onSelect: run((c) => c.setAlign("right")),
          },
          {
            label: m.word_menus_justify(),
            shortcut: keys("Ctrl+J"),
            checked: text.align === "justify",
            disabled: off,
            onSelect: run((c) => c.setAlign("justify")),
          },
        ],
        [
          {
            label: m.word_menus_bullets(),
            checked: state.paragraph.list === "bullet",
            disabled: off,
            onSelect: run((c) => void c.toggleList("bullet")),
          },
          {
            label: m.word_menus_numbering(),
            checked: state.paragraph.list === "number",
            disabled: off,
            onSelect: run((c) => void c.toggleList("number")),
          },
        ],
        ...paragraphSpacingGroups(state.paragraph.lineSpacing, context.layout, off),
        [
          {
            label: m.word_menus_clear_formatting(),
            shortcut: keys("Ctrl+Space"),
            disabled: off,
            onSelect: run((c) => c.clearFormatting()),
          },
        ],
      ],
    },
    mailMergeMenu(context.mailMerge, off),
    reviewMenu(state.review, context.review, off, [spellCheckItem(state.spelling, context.spelling, off)]),
  ];
};

/** Inside a link: edit, open or remove it; elsewhere: make one (DocumentHolder hyperlinkMenu). */
const linkItems = ({ state, links, onLink, onOpenLink }: WordMenuContext): MenuItem[] => {
  const { link } = state.paragraph;
  if (!link) return [{ label: m.word_menus_link(), onSelect: onLink }];
  return [
    { label: m.word_menus_edit_link(), onSelect: onLink },
    { label: m.word_menus_open_link(), onSelect: () => onOpenLink(link.url) },
    { label: m.word_menus_remove_link(), onSelect: () => links?.remove() },
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
    ...suggestionGroups(state.spelling, context.spelling),
    clipboardItems(view, context.onClipboardRefused),
    state.paragraph.inHeaderFooter
      ? [{ label: m.header_footer_menus_close(), onSelect: () => context.headerFooter?.close() }]
      : [{ label: m.word_menus_add_comment(), onSelect: context.onAddComment }],
    linkItems(context),
    ...(state.paragraph.inTable ? tableActions(run) : []),
    [
      { label: m.word_menus_clear_formatting(), onSelect: () => run((c) => c.clearFormatting()) },
      { label: m.common_select_all(), onSelect: () => run((c) => c.selectAll()) },
    ],
  ];
};
