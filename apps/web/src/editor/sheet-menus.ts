import type {
  CellCommands,
  ChartCommands,
  ChartFailure,
  ChartKind,
  ClipboardAction,
  DataCommands,
  NumberFormat,
  PivotCommands,
  RuleCommands,
  SheetCommands,
  SheetState,
  ViewCommands,
} from "@schreibzeug/editor-core";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
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
  rules: RuleCommands | null;
  pivots: PivotCommands | null;
  /** Opens the dialog for a new pivot table. */
  onInsertPivot: () => void;
  /** Opens the dropdown list of the selection. */
  onDropdown: () => void;
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
    { label: m.sheet_menus_insert_row(), disabled: off, onSelect: run((c) => c.insertRows()) },
    { label: m.sheet_menus_insert_column(), disabled: off, onSelect: run((c) => c.insertColumns()) },
  ],
  [
    { label: m.sheet_menus_delete_row(), danger: true, disabled: off, onSelect: run((c) => c.deleteRows()) },
    {
      label: m.sheet_menus_delete_column(),
      danger: true,
      disabled: off,
      onSelect: run((c) => c.deleteColumns()),
    },
  ],
];

/** The kinds of chart in the words of German Excel. */
export const CHART_LABELS: Record<ChartKind, string> = {
  column: m.sheet_menus_chart_column(),
  bar: m.sheet_menus_chart_bar(),
  line: m.sheet_menus_chart_line(),
  pie: m.sheet_menus_chart_pie(),
  area: m.sheet_menus_chart_area(),
};

export const CHART_FAILURES: Record<ChartFailure, string> = {
  noData: m.sheet_menus_chart_no_data(),
  tooManySeries: m.sheet_menus_chart_too_many_series(),
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
    label: m.sheet_menus_chart({ kind: CHART_LABELS[kind] }),
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
  { label: m.sheet_menus_sort_ascending(), disabled: off || !data, onSelect: () => data?.sort("ascending") },
  {
    label: m.sheet_menus_sort_descending(),
    disabled: off || !data,
    onSelect: () => data?.sort("descending"),
  },
];

/** Sorting and the filter buttons, as web-apps' "Daten" tab (spreadsheeteditor main Toolbar.js). */
export const dataMenu = (context: SheetMenuContext, off: boolean): Menu => {
  const { data } = context;
  const { filter } = context.state.data;
  return {
    label: m.sheet_menus_data(),
    groups: [
      sortItems(data, off),
      [
        {
          label: m.sheet_menus_filter(),
          checked: filter.on,
          disabled: off || !data || !filter.available,
          onSelect: () => data?.toggleFilter(),
        },
        {
          label: m.sheet_menus_clear_filter(),
          disabled: off || !data || !filter.applied,
          onSelect: () => data?.clearFilter(),
        },
      ],
      [{ label: m.sheet_menus_dropdown(), disabled: off || !context.rules, onSelect: context.onDropdown }],
      [refreshPivotItem(context, off)],
    ],
  };
};

/** Reads the source of the pivot table at the active cell again (PivotTable.js refresh). */
const refreshPivotItem = (context: Pick<SheetMenuContext, "pivots" | "state">, off: boolean): MenuItem => ({
  label: m.sheet_menus_refresh_pivot(),
  disabled: off || !context.pivots || !context.state.data.pivot,
  onSelect: () => context.pivots?.refresh(),
});

/** Quick conditional formats, as the first presets of web-apps' pickers (Toolbar.js). */
const conditionalItems = (rules: RuleCommands | null, off: boolean): MenuItem[] => [
  {
    label: m.sheet_menus_data_bars(),
    disabled: off || !rules,
    onSelect: () => rules?.quickFormat("dataBar"),
  },
  {
    label: m.sheet_menus_color_scale(),
    disabled: off || !rules,
    onSelect: () => rules?.quickFormat("colorScale"),
  },
  {
    label: m.sheet_menus_clear_conditional(),
    disabled: off || !rules,
    onSelect: () => rules?.clearFormats(),
  },
];

/** Frozen panes, as web-apps' "Fenster fixieren" (spreadsheeteditor main ViewTab.js). */
const freezeItems = (context: SheetMenuContext, off: boolean): MenuItem[] => {
  const { data } = context;
  const disabled = off || !data;
  return [
    {
      label: context.state.data.frozen ? m.sheet_menus_unfreeze() : m.sheet_menus_freeze(),
      disabled,
      onSelect: () => data?.toggleFreeze(),
    },
    { label: m.sheet_menus_freeze_top_row(), disabled, onSelect: () => data?.freeze("firstRow") },
    { label: m.sheet_menus_freeze_first_column(), disabled, onSelect: () => data?.freeze("firstColumn") },
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
        searchItems(context.onFind, off),
      ],
    },
    { label: m.common_view(), groups: [freezeItems(context, off), ...zoomGroups(view, document.zoom)] },
    {
      label: m.common_insert(),
      groups: [
        ...rowsAndColumns(run, off),
        [{ label: m.sheet_menus_sheet(), disabled: !context.sheets, onSelect: () => context.sheets?.add() }],
        chartItems(context, off),
        [
          {
            label: m.sheet_menus_pivot_table(),
            disabled: off || !context.pivots,
            onSelect: context.onInsertPivot,
          },
        ],
        [
          {
            label: m.sheet_menus_image(),
            disabled: off || !context.onInsertImage,
            onSelect: () => context.onInsertImage?.(),
          },
          { label: m.sheet_menus_comment(), disabled: off, onSelect: context.onAddComment },
        ],
      ],
    },
    {
      label: m.common_format(),
      groups: [
        [
          {
            label: m.common_bold(),
            shortcut: keys("Ctrl+B"),
            checked: cell.bold,
            disabled: off,
            onSelect: run((c) => c.toggleBold()),
          },
          {
            label: m.common_italic(),
            shortcut: keys("Ctrl+I"),
            checked: cell.italic,
            disabled: off,
            onSelect: run((c) => c.toggleItalic()),
          },
          {
            label: m.common_underline(),
            shortcut: keys("Ctrl+U"),
            checked: cell.underline,
            disabled: off,
            onSelect: run((c) => c.toggleUnderline()),
          },
          {
            label: m.sheet_menus_strikethrough(),
            checked: cell.strikeout,
            disabled: off,
            onSelect: run((c) => c.toggleStrikeout()),
          },
        ],
        [
          {
            label: m.sheet_menus_align_left(),
            checked: cell.align === "left",
            disabled: off,
            onSelect: run((c) => c.setAlign("left")),
          },
          {
            label: m.sheet_menus_align_center(),
            checked: cell.align === "center",
            disabled: off,
            onSelect: run((c) => c.setAlign("center")),
          },
          {
            label: m.sheet_menus_align_right(),
            checked: cell.align === "right",
            disabled: off,
            onSelect: run((c) => c.setAlign("right")),
          },
        ],
        [
          {
            label: m.sheet_menus_wrap_text(),
            checked: cell.wrap,
            disabled: off,
            onSelect: run((c) => c.toggleWrap()),
          },
          {
            label: cell.merged ? m.sheet_menus_unmerge() : m.sheet_menus_merge(),
            disabled: off || !(cell.merged || cell.mergeable),
            onSelect: run((c) => c.toggleMerge()),
          },
        ],
        (Object.keys(NUMBER_FORMAT_LABELS) as NumberFormat[]).map((format) => ({
          label: m.sheet_menus_number_format({ format: NUMBER_FORMAT_LABELS[format] }),
          checked: cell.numberFormat === format,
          disabled: off,
          onSelect: run((c) => c.setNumberFormat(format)),
        })),
        conditionalItems(context.rules, off),
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
    [{ label: m.sheet_menus_add_comment(), onSelect: context.onAddComment }],
    sortItems(context.data, off),
    ...(state.data.pivot ? [[refreshPivotItem(context, off)]] : []),
    ...rowsAndColumns(run, off),
  ];
};
