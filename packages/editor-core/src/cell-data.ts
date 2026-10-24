/**
 * Sorting, filtering and frozen panes of the spreadsheet, as web-apps' desktop spreadsheet editor
 * drives them (spreadsheeteditor main controller/Toolbar.js onSortType, onAutoFilter, onClearFilter;
 * controller/ViewTab.js onFreeze) and its mobile one shows a column's filter
 * (spreadsheeteditor mobile controller/FilterOptions.jsx).
 */
import type { CellEngineApi, CellWindow, EngineAutoFilterObject, EngineCellInfo } from "./engine-types";

/** The filter of the range around the active cell, and what the toolbar may do with it. */
export type FilterState = {
  /** A filter can be set or taken away here (not on a pivot table or a locked sheet). */
  available: boolean;
  /** The range has filter buttons. */
  on: boolean;
  /** Some rows are hidden by a filter, so "Filter löschen" has something to do. */
  applied: boolean;
};

/** The sheet's view around the data: its filter and whether rows or columns are frozen. */
export type SheetDataState = { filter: FilterState; frozen: boolean };

export const initialSheetDataState: SheetDataState = {
  filter: { available: false, on: false, applied: false },
  frozen: false,
};

/**
 * cell/model/CellInfo.js asc_CAutoFilterInfo: asc_getIsAutoFilter is true with buttons, false where
 * they can be added and null where they cannot (Toolbar.js onApiSelectionChanged, btnsSetAutofilter).
 */
export const readFilterState = (info: Pick<EngineCellInfo, "asc_getAutoFilterInfo">): FilterState => {
  const filter = info.asc_getAutoFilterInfo();
  const on = filter?.asc_getIsAutoFilter() ?? null;
  return {
    available: on !== null,
    on: on === true,
    applied: on === true && filter?.asc_getIsApplyAutoFilter() === true,
  };
};

/** The filter at the active cell and the sheet's frozen panes, as the engine has them now. */
export const readSheetData = (api: CellEngineApi, info: EngineCellInfo): SheetDataState => ({
  filter: readFilterState(info),
  frozen: Boolean(api.asc_getSheetViewSettings().asc_getIsFreezePane()),
});

export type SortOrder = "ascending" | "descending";
export type FreezeKind = "firstRow" | "firstColumn";

export type DataCommands = {
  /** Sorts the selection; a single column next to more data takes its rows along, as Excel asks to. */
  sort: (order: SortOrder) => void;
  /** Puts filter buttons on the range around the active cell, or takes them away. */
  toggleFilter: () => void;
  /** Shows every row again, keeping the buttons. */
  clearFilter: () => void;
  /**
   * Freezes the rows above and the columns left of the active cell, or unfreezes what is frozen:
   * the first entry of web-apps' "Fenster fixieren" menu (ViewTab.js), which reads "Fixierung
   * aufheben" while something is frozen.
   */
  toggleFreeze: () => void;
  /** Freezes just the first row or column. */
  freeze: (kind: FreezeKind) => void;
};

type DataConstants = Pick<
  CellWindow["Asc"],
  "c_oAscSortOptions" | "c_oAscSelectionSortExpand" | "c_oAscChangeFilterOptions" | "c_oAscFrozenPaneAddType"
>;

const tableNameOf = (info: EngineCellInfo): string | undefined =>
  info.asc_getFormatTableInfo()?.asc_getTableName() ?? undefined;

/**
 * `refresh` reads the state again after a change the engine reports no event for: freezing waits
 * for the pane's lock (WorksheetView.js _isLockedFrozenPane), which in a shared session is the
 * relay's answer, so it is read again shortly after and whenever the selection moves.
 * Sorting expands to the rows around a single column without asking (Toolbar.js shows a question
 * for showExpandMessage; keeping rows together is what that question's default does), and sorts
 * just the selection when the rows around it are locked by someone else (showLockMessage, "yes").
 */
export const createDataCommands = (
  api: CellEngineApi,
  Asc: DataConstants,
  refresh: () => void,
): DataCommands => {
  const sortOrder = (order: SortOrder) =>
    order === "ascending" ? Asc.c_oAscSortOptions.Ascending : Asc.c_oAscSortOptions.Descending;
  return {
    sort: (order) => {
      const expand = api.asc_sortCellsRangeExpand();
      const { expandAndNotShowMessage, showExpandMessage } = Asc.c_oAscSelectionSortExpand;
      api.asc_sortColFilter(
        sortOrder(order),
        "",
        undefined,
        undefined,
        expand === expandAndNotShowMessage || expand === showExpandMessage,
      );
    },
    toggleFilter: () => {
      const info = api.asc_getCellInfo();
      const on = readFilterState(info).on;
      const table = tableNameOf(info);
      if (table !== undefined || on)
        api.asc_changeAutoFilter(table, Asc.c_oAscChangeFilterOptions.filter, !on);
      else api.asc_addAutoFilter();
    },
    clearFilter: () => api.asc_clearFilter(),
    // Without a type, freezePane freezes at the active cell or unfreezes (WorksheetView.js freezePane).
    toggleFreeze: () => {
      api.asc_freezePane();
      refresh();
    },
    freeze: (kind) => {
      api.asc_freezePane(
        kind === "firstRow" ? Asc.c_oAscFrozenPaneAddType.firstRow : Asc.c_oAscFrozenPaneAddType.firstCol,
      );
      refresh();
    },
  };
};

/** One value of a column, as the column's filter lists it. */
export type FilterValue = { text: string; visible: boolean };

/** A click on a column's filter button: what the engine asks us to show next to it. */
export type FilterRequest = {
  /** Below the button's right edge, in the frame's coordinates. */
  x: number;
  y: number;
  values: FilterValue[];
  sorted: SortOrder | null;
  /** Shows the rows whose value is marked visible (by the values' order). */
  apply: (visible: boolean[]) => void;
  sort: (order: SortOrder) => void;
};

/**
 * Turns the engine's request for a column's filter (asc_onSetAFDialog with an
 * asc_CAutoFilterObject, cell/model/autofilters.js) into ours, as FilterOptions.jsx reads and
 * applies it: the values with their visibility, set back on the object and applied as a "Filters"
 * filter. The button's place is relative to the grid's canvas; `origin` is where that sits.
 */
export const toFilterRequest = (
  config: EngineAutoFilterObject,
  api: CellEngineApi,
  Asc: Pick<CellWindow["Asc"], "c_oAscSortOptions" | "c_oAscAutoFilterTypes">,
  origin: { left: number; top: number },
): FilterRequest => {
  const rect = config.asc_getCellCoord();
  const state = config.asc_getSortState();
  const values = config.asc_getValues();
  return {
    x: origin.left + rect.asc_getX() + rect.asc_getWidth(),
    y: origin.top + rect.asc_getY() + rect.asc_getHeight(),
    values: values.map((value) => ({ text: value.asc_getText(), visible: Boolean(value.asc_getVisible()) })),
    sorted:
      state === Asc.c_oAscSortOptions.Ascending
        ? "ascending"
        : state === Asc.c_oAscSortOptions.Descending
          ? "descending"
          : null,
    apply: (visible) => {
      if (!visible.some(Boolean)) return;
      for (const [index, value] of values.entries()) value.asc_setVisible(visible[index] ?? true);
      config.asc_getFilterObj().asc_setType(Asc.c_oAscAutoFilterTypes.Filters);
      api.asc_applyAutoFilter(config);
    },
    sort: (order) =>
      api.asc_sortColFilter(
        order === "ascending" ? Asc.c_oAscSortOptions.Ascending : Asc.c_oAscSortOptions.Descending,
        config.asc_getCellId(),
        config.asc_getDisplayName(),
      ),
  };
};
