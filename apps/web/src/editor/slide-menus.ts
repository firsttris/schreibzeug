import type {
  ClipboardAction,
  ContextMenuArea,
  DesignCommands,
  SlideCommands,
  SlideState,
  SpellingCommands,
  ViewCommands,
} from "@schreibzeug/editor-core";
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
  { label: "Neue Folie", disabled: off, onSelect: run((c) => c.addSlide()) },
  { label: "Folie duplizieren", disabled: off, onSelect: run((c) => c.duplicateSlide()) },
  {
    label: "Folie löschen",
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
        [
          {
            label: "Bildschirmpräsentation von Anfang an",
            disabled: !context.onPresent,
            onSelect: () => context.onPresent?.("beginning"),
          },
          {
            label: "Bildschirmpräsentation ab aktueller Folie",
            disabled: !context.onPresent,
            onSelect: () => context.onPresent?.("current"),
          },
        ],
        ...zoomGroups(view, document.zoom),
        [notesItem(state, context.design, off)],
      ],
    },
    {
      label: "Einfügen",
      groups: [
        [
          {
            label: "Bild …",
            disabled: off || !context.onInsertImage,
            onSelect: () => context.onInsertImage?.(),
          },
          { label: "Kommentar", disabled: off, onSelect: context.onAddComment },
        ],
        shapeItems(context.design, off),
      ],
    },
    {
      label: "Folie",
      groups: [
        slideItems(run, off, document.pages),
        state.layouts.map((layout) => ({
          label: `Layout: ${layout.name}`,
          disabled: off,
          onSelect: run((c) => c.setLayout(layout.index)),
        })),
      ],
    },
    ...designMenus(state, context.design, off),
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
            checked: text.baseline === "superscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("superscript")),
          },
          {
            label: "Tiefgestellt",
            checked: text.baseline === "subscript",
            disabled: off,
            onSelect: run((c) => c.toggleBaseline("subscript")),
          },
        ],
        [
          {
            label: "Linksbündig",
            checked: text.align === "left",
            disabled: off,
            onSelect: run((c) => c.setAlign("left")),
          },
          {
            label: "Zentriert",
            checked: text.align === "center",
            disabled: off,
            onSelect: run((c) => c.setAlign("center")),
          },
          {
            label: "Rechtsbündig",
            checked: text.align === "right",
            disabled: off,
            onSelect: run((c) => c.setAlign("right")),
          },
          {
            label: "Blocksatz",
            checked: text.align === "justify",
            disabled: off,
            onSelect: run((c) => c.setAlign("justify")),
          },
        ],
        [
          {
            label: "Aufzählung",
            checked: state.list === "bullet",
            disabled: off,
            onSelect: run((c) => c.toggleList("bullet")),
          },
          {
            label: "Nummerierung",
            checked: state.list === "number",
            disabled: off,
            onSelect: run((c) => c.toggleList("number")),
          },
        ],
        [{ label: "Formatierung löschen", disabled: off, onSelect: run((c) => c.clearFormatting()) }],
      ],
    },
    { label: "Überprüfen", groups: [[spellCheckItem(state.spelling, context.spelling, off)]] },
  ];
};

/** The right-click menu: on the slide the clipboard first, in the slide list the slides first. */
export const slideContextMenu = (context: SlideMenuContext, area: ContextMenuArea): MenuItem[][] => {
  const { commands, state } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (c: SlideCommands) => void) => () => commands && action(commands);
  const clipboard = clipboardItems(context.view, context.onClipboardRefused);
  const slides = slideItems(run, off, state.document.pages);
  const comment = [{ label: "Kommentar hinzufügen", onSelect: context.onAddComment }];
  return area === "thumbnails"
    ? [slides, clipboard]
    : [...suggestionGroups(state.spelling, context.spelling), clipboard, comment, slides];
};
