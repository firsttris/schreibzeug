import type {
  ClipboardAction,
  ContextMenuArea,
  PageCommands,
  PdfCommands,
  PdfState,
  PdfTool,
  ViewCommands,
} from "@schreibzeug/editor-core";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";
import { clipboardItems, zoomGroups } from "./common-menus";

/** What the menus of a PDF work with; null while it opens. */
export type PdfMenuContext = {
  state: PdfState;
  commands: PdfCommands | null;
  pages: PageCommands | null;
  view: ViewCommands | null;
  onClipboardRefused: (action: ClipboardAction) => void;
  /** Opens the comments with the field for a new note on the page in view. */
  onAddNote: () => void;
  /** Opens the signature dialog; null where no picture can be put on the page. */
  onSign: (() => void) | null;
  /** Opens the dialog for a digital signature with a certificate; null where the PDF cannot be replaced. */
  onSignDigitally: (() => void) | null;
  /** Asks for a PDF on the computer and appends its pages. */
  onAppendPdf: () => void;
  /** Stores the selected pages as a new PDF beside this one; null where no file can be made. */
  onExtractPages: (() => void) | null;
  /** Tells the person why a command did nothing. */
  notify: (message: string) => void;
};

/** The tools of "Kommentieren", with the label the menu and the toolbar share. */
export const ANNOTATION_TOOLS: Array<{ tool: PdfTool; label: string }> = [
  { tool: "highlight", label: "Text hervorheben" },
  { tool: "underline", label: "Text unterstreichen" },
  { tool: "strikeout", label: "Text durchstreichen" },
  { tool: "draw", label: "Freihand zeichnen" },
  { tool: "square", label: "Rechteck" },
  { tool: "circle", label: "Ellipse" },
  { tool: "line", label: "Linie" },
];

/** A tool switches on, or off again when it is the one in use. */
export const toggleTool = (commands: PdfCommands, current: PdfTool, tool: PdfTool): void =>
  commands.setTool(current === tool ? "select" : tool);

const LAST_PAGE_MESSAGE = "Die letzte Seite eines PDFs kann nicht gelöscht werden.";

/** Pages from 0 as people count them: "Seite 2", "Seiten 1–3", "Seiten 1, 3–4". */
export const pagesLabel = (pages: number[]): string => {
  const sorted = [...new Set(pages)].sort((a, b) => a - b).map((page) => page + 1);
  const runs: Array<[number, number]> = [];
  for (const page of sorted) {
    const last = runs[runs.length - 1];
    if (last && page === last[1] + 1) last[1] = page;
    else runs.push([page, page]);
  }
  const text = runs.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(", ");
  return sorted.length === 1 ? `Seite ${text}` : `Seiten ${text}`;
};

/** Turn, add, remove pages: in "Seiten" and in the context menu of the page thumbnails. */
export const pageItems = (context: PdfMenuContext, off: boolean): MenuItem[][] => {
  const { pages } = context;
  const run = (action: (p: PageCommands) => void) => () => pages && action(pages);
  return [
    [
      { label: "Nach rechts drehen", disabled: off, onSelect: run((p) => p.rotate("right")) },
      { label: "Nach links drehen", disabled: off, onSelect: run((p) => p.rotate("left")) },
    ],
    [
      { label: "Leere Seite davor", disabled: off, onSelect: run((p) => p.addBlank("before")) },
      { label: "Leere Seite danach", disabled: off, onSelect: run((p) => p.addBlank("after")) },
    ],
    [
      { label: "PDF anhängen …", disabled: off, onSelect: context.onAppendPdf },
      {
        label: "Als neues PDF speichern",
        disabled: off || !context.onExtractPages,
        onSelect: () => context.onExtractPages?.(),
      },
    ],
    [
      {
        label: "Seiten löschen",
        danger: true,
        disabled: off || context.state.document.pages <= 1,
        onSelect: run((p) => {
          if (!p.remove()) context.notify(LAST_PAGE_MESSAGE);
        }),
      },
    ],
  ];
};

/**
 * Bearbeiten, Ansicht, Kommentieren, Seiten and Schwärzen of a PDF, after the PDF editor of web-apps
 * (pdfeditor main Toolbar.js, RedactTab.js, PageThumbnails.js) as far as Schreibzeug has the commands.
 */
export const pdfMenus = (context: PdfMenuContext): Menu[] => {
  const { state, commands, view } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (c: PdfCommands) => void) => () => commands && action(commands);
  const { document, tool } = state;

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
      ],
    },
    {
      label: "Ansicht",
      groups: [
        [
          {
            label: "Auswählen",
            checked: tool === "select",
            disabled: off,
            onSelect: run((c) => c.setTool("select")),
          },
          {
            label: "Verschieben (Hand)",
            checked: tool === "hand",
            disabled: off,
            onSelect: run((c) => c.setTool("hand")),
          },
        ],
        ...zoomGroups(view, document.zoom),
      ],
    },
    {
      label: "Kommentieren",
      groups: [
        [
          { label: "Notiz", disabled: off, onSelect: context.onAddNote },
          { label: "Textfeld", disabled: off, onSelect: run((c) => c.addTextBox()) },
          { label: "Unterschreiben …", disabled: off || !context.onSign, onSelect: () => context.onSign?.() },
          {
            label: "Digital signieren …",
            disabled: off || !context.onSignDigitally,
            onSelect: () => context.onSignDigitally?.(),
          },
        ],
        ANNOTATION_TOOLS.map(({ tool: entry, label }) => ({
          label,
          checked: tool === entry,
          disabled: off,
          onSelect: run((c) => toggleTool(c, tool, entry)),
        })),
      ],
    },
    { label: "Seiten", groups: pageItems(context, off) },
    {
      label: "Schwärzen",
      groups: [
        [
          {
            label: "Bereiche markieren",
            checked: tool === "redact",
            disabled: off,
            onSelect: run((c) => toggleTool(c, tool, "redact")),
          },
          {
            label: "Schwärzungen anwenden",
            danger: true,
            disabled: off,
            onSelect: run((c) => {
              if (!c.hasRedactions()) return context.notify("Es sind keine Bereiche zum Schwärzen markiert.");
              c.applyRedactions();
              c.setTool("select");
            }),
          },
        ],
      ],
    },
  ];
};

/** The context menu: pages in the thumbnails, otherwise the clipboard and a note. */
export const pdfContextMenu = (context: PdfMenuContext, area: ContextMenuArea): MenuItem[][] => {
  const off = !context.commands || context.state.status !== "ready";
  if (area === "thumbnails") return pageItems(context, off);
  return [
    clipboardItems(context.view, context.onClipboardRefused),
    [{ label: "Notiz hinzufügen", disabled: off, onSelect: context.onAddNote }],
  ];
};
