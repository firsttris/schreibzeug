import type {
  ClipboardAction,
  ContextMenuArea,
  DesignCommands,
  SlideCommands,
  SlideState,
  SpellingCommands,
  ViewCommands,
} from "@schreibzeug/editor-core";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";
import { clipboardItems, searchItems, zoomGroups } from "./common-menus";
import { designMenus, notesItem, shapeItems } from "./slide-design-menus";
import { spellCheckItem, suggestionGroups } from "./spelling-menus";

/** What the menus of the presentation work with; null while the document opens. */
export type SlideMenuContext = {
  state: SlideState;
  commands: SlideCommands | null;
  design: DesignCommands | null;
  view: ViewCommands | null;
  spelling: SpellingCommands | null;
  onClipboardRefused: (action: ClipboardAction) => void;
  onFind: (mode: "find" | "replace") => void;
  /** Starts the slide show full screen; null while the presentation opens. */
  onPresent: ((from: "current" | "beginning") => void) | null;
  /** Opens the comments with the field for a new one on the current slide. */
  onAddComment: () => void;
  /** Opens the file dialog for an image; null where none can be put in. */
  onInsertImage: (() => void) | null;
};

/** New, duplicate, delete: in "Folie" and in the context menu. */
const slideItems = (
  run: (action: (c: SlideCommands) => void) => () => void,
  off: boolean,
  slides: number,
): MenuItem[] => [
  { label: m.slide_menus_new_slide(), disabled: off, onSelect: run((c) => c.addSlide()) },
  { label: m.slide_menus_duplicate_slide(), disabled: off, onSelect: run((c) => c.duplicateSlide()) },
  {
    label: m.slide_menus_delete_slide(),
    danger: true,
    disabled: off || slides <= 1,
    onSelect: run((c) => c.deleteSlide()),
  },
];

/**
 * Bearbeiten, Ansicht, Einfügen, Folie, Design, Übergänge and Format of the presentation, after the desktop presentation editor
 * of web-apps (presentationeditor main Toolbar.js) as far as Schreibzeug has the commands.
 */
export const slideMenus = (context: SlideMenuContext): Menu[] => {
  const { state, commands, view } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (c: SlideCommands) => void) => () => commands && action(commands);
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
        [
          {
            label: m.slide_menus_show_from_beginning(),
            disabled: !context.onPresent,
            onSelect: () => context.onPresent?.("beginning"),
          },
          {
            label: m.slide_menus_show_from_current(),
            disabled: !context.onPresent,
            onSelect: () => context.onPresent?.("current"),
          },
        ],
        ...zoomGroups(view, document.zoom),
        [notesItem(state, context.design, off)],
      ],
    },
    {
      label: m.common_insert(),
      groups: [
        [
          {
            label: m.slide_menus_image(),
            disabled: off || !context.onInsertImage,
            onSelect: () => context.onInsertImage?.(),
          },
          { label: m.slide_menus_comment(), disabled: off, onSelect: context.onAddComment },
        ],
        shapeItems(context.design, off),
      ],
    },
    {
      label: m.slide_menus_slide(),
      groups: [
        slideItems(run, off, document.pages),
        state.layouts.map((layout) => ({
          label: m.slide_menus_layout({ name: layout.name }),
          disabled: off,
          onSelect: run((c) => c.setLayout(layout.index)),
        })),
      ],
    },
    ...designMenus(state, context.design, off),
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
            label: m.slide_menus_strikethrough(),
            checked: text.strikeout,
            disabled: off,
            onSelect: run((c) => c.toggleStrikeout()),
          },
          {
            label: m.slide_menus_superscript(),
            checked: text.baseline === "superscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("superscript")),
          },
          {
            label: m.slide_menus_subscript(),
            checked: text.baseline === "subscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("subscript")),
          },
        ],
        [
          {
            label: m.slide_menus_align_left(),
            checked: text.align === "left",
            disabled: off,
            onSelect: run((c) => c.setAlign("left")),
          },
          {
            label: m.slide_menus_align_center(),
            checked: text.align === "center",
            disabled: off,
            onSelect: run((c) => c.setAlign("center")),
          },
          {
            label: m.slide_menus_align_right(),
            checked: text.align === "right",
            disabled: off,
            onSelect: run((c) => c.setAlign("right")),
          },
          {
            label: m.slide_menus_justify(),
            checked: text.align === "justify",
            disabled: off,
            onSelect: run((c) => c.setAlign("justify")),
          },
        ],
        [
          {
            label: m.slide_menus_bullets(),
            checked: state.list === "bullet",
            disabled: off,
            onSelect: run((c) => c.toggleList("bullet")),
          },
          {
            label: m.slide_menus_numbering(),
            checked: state.list === "number",
            disabled: off,
            onSelect: run((c) => c.toggleList("number")),
          },
        ],
        [
          {
            label: m.slide_menus_clear_formatting(),
            disabled: off,
            onSelect: run((c) => c.clearFormatting()),
          },
        ],
      ],
    },
    { label: m.slide_menus_review(), groups: [[spellCheckItem(state.spelling, context.spelling, off)]] },
  ];
};

/** The right-click menu: on the slide the clipboard first, in the slide list the slides first. */
export const slideContextMenu = (context: SlideMenuContext, area: ContextMenuArea): MenuItem[][] => {
  const { commands, state } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (c: SlideCommands) => void) => () => commands && action(commands);
  const clipboard = clipboardItems(context.view, context.onClipboardRefused);
  const slides = slideItems(run, off, state.document.pages);
  const comment = [{ label: m.slide_menus_add_comment(), onSelect: context.onAddComment }];
  return area === "thumbnails"
    ? [slides, clipboard]
    : [...suggestionGroups(state.spelling, context.spelling), clipboard, comment, slides];
};
