import type {
  ClipboardAction,
  ContextMenuArea,
  PageCommands,
  PdfCommands,
  PdfState,
  PdfTool,
  ViewCommands,
} from "@schreibzeug/editor-core";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
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
  /** Opens "Text erkennen" for scanned pages; null where the PDF cannot be replaced. */
  onRecognizeText: (() => void) | null;
  /** Tells the person why a command did nothing. */
  notify: (message: string) => void;
};

/** The tools of "Kommentieren", with the label the menu and the toolbar share. */
export const ANNOTATION_TOOLS: Array<{ tool: PdfTool; label: string }> = [
  { tool: "highlight", label: m.pdf_menus_highlight() },
  { tool: "underline", label: m.pdf_menus_underline() },
  { tool: "strikeout", label: m.pdf_menus_strikeout() },
  { tool: "draw", label: m.pdf_menus_draw() },
  { tool: "square", label: m.pdf_menus_rectangle() },
  { tool: "circle", label: m.pdf_menus_ellipse() },
  { tool: "line", label: m.pdf_menus_line() },
];

/** A tool switches on, or off again when it is the one in use. */
export const toggleTool = (commands: PdfCommands, current: PdfTool, tool: PdfTool): void =>
  commands.setTool(current === tool ? "select" : tool);

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
  return sorted.length === 1
    ? m.pdf_menus_page_one({ pages: text })
    : m.pdf_menus_page_other({ pages: text });
};

/** Turn, add, remove pages: in "Seiten" and in the context menu of the page thumbnails. */
export const pageItems = (context: PdfMenuContext, off: boolean): MenuItem[][] => {
  const { pages } = context;
  const run = (action: (p: PageCommands) => void) => () => pages && action(pages);
  return [
    [
      { label: m.pdf_menus_rotate_right(), disabled: off, onSelect: run((p) => p.rotate("right")) },
      { label: m.pdf_menus_rotate_left(), disabled: off, onSelect: run((p) => p.rotate("left")) },
    ],
    [
      { label: m.pdf_menus_blank_before(), disabled: off, onSelect: run((p) => p.addBlank("before")) },
      { label: m.pdf_menus_blank_after(), disabled: off, onSelect: run((p) => p.addBlank("after")) },
    ],
    [
      { label: m.pdf_menus_append_pdf(), disabled: off, onSelect: context.onAppendPdf },
      {
        label: m.pdf_menus_save_as_new(),
        disabled: off || !context.onExtractPages,
        onSelect: () => context.onExtractPages?.(),
      },
    ],
    [
      {
        label: m.pdf_menus_delete_pages(),
        danger: true,
        disabled: off || context.state.document.pages <= 1,
        onSelect: run((p) => {
          if (!p.remove()) context.notify(m.pdf_menus_last_page());
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
      ],
    },
    {
      label: m.common_view(),
      groups: [
        [
          {
            label: m.pdf_menus_select(),
            checked: tool === "select",
            disabled: off,
            onSelect: run((c) => c.setTool("select")),
          },
          {
            label: m.pdf_menus_hand(),
            checked: tool === "hand",
            disabled: off,
            onSelect: run((c) => c.setTool("hand")),
          },
        ],
        ...zoomGroups(view, document.zoom),
      ],
    },
    {
      label: m.pdf_menus_annotate(),
      groups: [
        [
          { label: m.pdf_menus_note(), disabled: off, onSelect: context.onAddNote },
          { label: m.pdf_menus_text_box(), disabled: off, onSelect: run((c) => c.addTextBox()) },
          { label: m.pdf_menus_sign(), disabled: off || !context.onSign, onSelect: () => context.onSign?.() },
          {
            label: m.pdf_menus_sign_digitally(),
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
    {
      label: m.pdf_menus_pages(),
      groups: [
        ...pageItems(context, off),
        [
          {
            label: m.pdf_menus_recognize_text(),
            disabled: off || !context.onRecognizeText,
            onSelect: () => context.onRecognizeText?.(),
          },
        ],
      ],
    },
    {
      label: m.pdf_menus_redact(),
      groups: [
        [
          {
            label: m.pdf_menus_mark_areas(),
            checked: tool === "redact",
            disabled: off,
            onSelect: run((c) => toggleTool(c, tool, "redact")),
          },
          {
            label: m.pdf_menus_apply_redactions(),
            danger: true,
            disabled: off,
            onSelect: run((c) => {
              if (!c.hasRedactions()) return context.notify(m.pdf_menus_no_redactions());
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
    [{ label: m.pdf_menus_add_note(), disabled: off, onSelect: context.onAddNote }],
  ];
};
