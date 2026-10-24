import type {
  CellCommands,
  ChartCommands,
  ChartFailure,
  ChartKind,
  ClipboardAction,
  DataCommands,
  NumberFormat,
  SheetCommands,
  SheetState,
  ViewCommands,
} from "@schreibzeug/editor-core";
import { NUMBER_FORMAT_LABELS } from "../toolbar/sheet-toolbar";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";
import { clipboardItems, searchItems, zoomGroups } from "./common-menus";

/** What the menus of the spreadsheet work with; null while the document opens. */
export type SheetMenuContext = {
  state: SheetState;
  commands: CellCommands | null;
  sheets: SheetCommands | null;
  data: DataCommands | null;
  charts: ChartCommands | null;
  /** Says why no chart could be made of the selection. */
  onChartFailure: (failure: ChartFailure) => void;
  view: ViewCommands | null;
  onClipboardRefused: (action: ClipboardAction) => void;
  onFind: (mode: "find" | "replace") => void;
  /** Opens the file dialog for an image; null where none can be put in. */
  onInsertImage: (() => void) | null;
  /** Opens the comments with the field for a new one on the active cell. */
  onAddComment: () => void;
};

/** Rows and columns: in "Einfügen" and in the context menu. */
const rowsAndColumns = (
  run: (action: (c: CellCommands) => void) => () => void,
  off: boolean,
): MenuItem[][] => [
  [
    { label: "Zeile einfügen", disabled: off, onSelect: run((c) => c.insertRows()) },
    { label: "Spalte einfügen", disabled: off, onSelect: run((c) => c.insertColumns()) },
  ],
  [
    { label: "Zeile löschen", danger: true, disabled: off, onSelect: run((c) => c.deleteRows()) },
    { label: "Spalte löschen", danger: true, disabled: off, onSelect: run((c) => c.deleteColumns()) },
  ],
];

/** The kinds of chart in the words of German Excel. */
export const CHART_LABELS: Record<ChartKind, string> = {
  column: "Säulen",
  bar: "Balken",
  line: "Linien",
  pie: "Kreis",
  area: "Fläche",
};

export const CHART_FAILURES: Record<ChartFailure, string> = {
  noData: "Für ein Diagramm bitte zuerst die Zellen mit den Zahlen markieren.",
  tooManySeries: "Die Markierung hat zu viele Datenreihen für ein Diagramm.",
};

/**
 * A chart of the selection, or, with a chart selected, its kind (checked) to change: in "Einfügen"
 * and under the toolbar's chart button, as web-apps' chart types (AddChart.jsx, EditChart.jsx).
 */
export const chartItems = (
  context: Pick<SheetMenuContext, "charts" | "onChartFailure" | "state">,
  off: boolean,
): MenuItem[] => {
  const { charts, onChartFailure } = context;
  const selected = context.state.data.chart;
  return (Object.keys(CHART_LABELS) as ChartKind[]).map((kind) => ({
    label: `Diagramm: ${CHART_LABELS[kind]}`,
    disabled: off || !charts,
    ...(selected ? { checked: selected === kind } : {}),
    onSelect: () => {
      if (!charts) return;
      if (selected) return charts.changeKind(kind);
      const failure = charts.insert(kind);
      if (failure) onChartFailure(failure);
    },
  }));
};

/** Sorting the selection: in "Daten" and in the context menu. */
const sortItems = (data: DataCommands | null, off: boolean): MenuItem[] => [
  { label: "Aufsteigend sortieren (A–Z)", disabled: off || !data, onSelect: () => data?.sort("ascending") },
  { label: "Absteigend sortieren (Z–A)", disabled: off || !data, onSelect: () => data?.sort("descending") },
];

/** Sorting and the filter buttons, as web-apps' "Daten" tab (spreadsheeteditor main Toolbar.js). */
export const dataMenu = (context: SheetMenuContext, off: boolean): Menu => {
  const { data } = context;
  const { filter } = context.state.data;
  return {
    label: "Daten",
    groups: [
      sortItems(data, off),
      [
        {
          label: "Filter",
          checked: filter.on,
          disabled: off || !data || !filter.available,
          onSelect: () => data?.toggleFilter(),
        },
        {
          label: "Filter löschen",
          disabled: off || !data || !filter.applied,
          onSelect: () => data?.clearFilter(),
        },
      ],
    ],
  };
};

/** Frozen panes, as web-apps' "Fenster fixieren" (spreadsheeteditor main ViewTab.js). */
const freezeItems = (context: SheetMenuContext, off: boolean): MenuItem[] => {
  const { data } = context;
  const disabled = off || !data;
  return [
    {
      label: context.state.data.frozen ? "Fixierung aufheben" : "Fenster fixieren",
      disabled,
      onSelect: () => data?.toggleFreeze(),
    },
    { label: "Oberste Zeile fixieren", disabled, onSelect: () => data?.freeze("firstRow") },
    { label: "Erste Spalte fixieren", disabled, onSelect: () => data?.freeze("firstColumn") },
  ];
};

/**
 * Bearbeiten, Ansicht, Einfügen, Format and Daten of the spreadsheet, after the desktop spreadsheet editor
 * of web-apps (spreadsheeteditor main Toolbar.js) as far as Schreibzeug has the commands.
 */
export const sheetMenus = (context: SheetMenuContext): Menu[] => {
  const { state, commands, view } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (c: CellCommands) => void) => () => commands && action(commands);
  const { cell, document } = state;

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
        searchItems(context.onFind, off),
      ],
    },
    { label: "Ansicht", groups: [freezeItems(context, off), ...zoomGroups(view, document.zoom)] },
    {
      label: "Einfügen",
      groups: [
        ...rowsAndColumns(run, off),
        [{ label: "Tabellenblatt", disabled: !context.sheets, onSelect: () => context.sheets?.add() }],
        chartItems(context, off),
        [
          {
            label: "Bild …",
            disabled: off || !context.onInsertImage,
            onSelect: () => context.onInsertImage?.(),
          },
          { label: "Kommentar", disabled: off, onSelect: context.onAddComment },
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
            checked: cell.bold,
            disabled: off,
            onSelect: run((c) => c.toggleBold()),
          },
          {
            label: "Kursiv",
            shortcut: "Strg+I",
            checked: cell.italic,
            disabled: off,
            onSelect: run((c) => c.toggleItalic()),
          },
          {
            label: "Unterstrichen",
            shortcut: "Strg+U",
            checked: cell.underline,
            disabled: off,
            onSelect: run((c) => c.toggleUnderline()),
          },
          {
            label: "Durchgestrichen",
            checked: cell.strikeout,
            disabled: off,
            onSelect: run((c) => c.toggleStrikeout()),
          },
        ],
        [
          {
            label: "Linksbündig",
            checked: cell.align === "left",
            disabled: off,
            onSelect: run((c) => c.setAlign("left")),
          },
          {
            label: "Zentriert",
            checked: cell.align === "center",
            disabled: off,
            onSelect: run((c) => c.setAlign("center")),
          },
          {
            label: "Rechtsbündig",
            checked: cell.align === "right",
            disabled: off,
            onSelect: run((c) => c.setAlign("right")),
          },
        ],
        [
          { label: "Zeilenumbruch", checked: cell.wrap, disabled: off, onSelect: run((c) => c.toggleWrap()) },
          {
            label: cell.merged ? "Zellverbund aufheben" : "Zellen verbinden",
            disabled: off || !(cell.merged || cell.mergeable),
            onSelect: run((c) => c.toggleMerge()),
          },
        ],
        (Object.keys(NUMBER_FORMAT_LABELS) as NumberFormat[]).map((format) => ({
          label: `Zahlenformat: ${NUMBER_FORMAT_LABELS[format]}`,
          checked: cell.numberFormat === format,
          disabled: off,
          onSelect: run((c) => c.setNumberFormat(format)),
        })),
      ],
    },
    dataMenu(context, off),
  ];
};

/** The right-click menu of the grid: the clipboard, then rows and columns, as web-apps offers. */
export const sheetContextMenu = (context: SheetMenuContext): MenuItem[][] => {
  const { commands, state } = context;
  const off = !commands || state.status !== "ready";
  const run = (action: (c: CellCommands) => void) => () => commands && action(commands);
  return [
    clipboardItems(context.view, context.onClipboardRefused),
    [{ label: "Kommentar hinzufügen", onSelect: context.onAddComment }],
    sortItems(context.data, off),
    ...rowsAndColumns(run, off),
  ];
};
