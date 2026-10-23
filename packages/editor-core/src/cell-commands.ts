import { NUMBER_FORMATS } from "./cell-format";
import type { NumberFormat, SheetState } from "./cell-state";
import type { TextColor } from "./colors";
import type { CellEngineApi, CellWindow, EngineColor } from "./engine-types";
import { type AlignConstants, fromAlign } from "./events";
import type { Align } from "./state";

export type CellCommands = {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikeout: () => void;
  setFontName: (name: string) => void;
  setFontSize: (size: number) => void;
  setColor: (color: TextColor) => void;
  setFill: (color: TextColor) => void;
  setAlign: (align: Align) => void;
  toggleWrap: () => void;
  setNumberFormat: (format: NumberFormat) => void;
  /** Merges the selection, or splits it when it holds merged cells. */
  toggleMerge: () => void;
  insertRows: () => void;
  insertColumns: () => void;
  deleteRows: () => void;
  deleteColumns: () => void;
  undo: () => void;
  redo: () => void;
};

/** The largest font size a spreadsheet cell takes (web-apps EditCell.jsx onFontSize: 409). */
export const MAX_CELL_FONT_SIZE = 409;

/** Half points from 1 to 409, as Excel takes them. */
export const clampCellFontSize = (size: number): number =>
  Math.min(MAX_CELL_FONT_SIZE, Math.max(1, Math.round(size * 2) / 2));

/**
 * Commands on the selected cells (cell/api.js asc_setCell…, as web-apps' spreadsheeteditor/mobile
 * EditCell.jsx calls them). Toggles read the state, since the engine takes the target value.
 */
export const createCellCommands = (
  api: CellEngineApi,
  getState: () => SheetState,
  constants: { aligns: AlignConstants; Asc: CellWindow["Asc"] },
  engineColor: (color: TextColor) => EngineColor,
): CellCommands => {
  const { aligns, Asc } = constants;
  const cell = () => getState().cell;
  return {
    toggleBold: () => api.asc_setCellBold(!cell().bold),
    toggleItalic: () => api.asc_setCellItalic(!cell().italic),
    toggleUnderline: () => api.asc_setCellUnderline(!cell().underline),
    toggleStrikeout: () => api.asc_setCellStrikeout(!cell().strikeout),
    setFontName: (name) => api.asc_setCellFontName(name),
    setFontSize: (size) => api.asc_setCellFontSize(clampCellFontSize(size)),
    setColor: (color) => api.asc_setCellTextColor(engineColor(color)),
    // web-apps passes null for "no fill" (EditCell.jsx onFillColor).
    setFill: (color) => api.asc_setCellBackgroundColor(color === null ? null : engineColor(color)),
    setAlign: (align) => api.asc_setCellAlign(fromAlign(align, aligns)),
    toggleWrap: () => api.asc_setCellTextWrap(!cell().wrap),
    setNumberFormat: (format) => api.asc_setCellFormat(NUMBER_FORMATS[format]),
    toggleMerge: () =>
      api.asc_mergeCells(cell().merged ? Asc.c_oAscMergeOptions.None : Asc.c_oAscMergeOptions.Merge),
    insertRows: () => api.asc_insertCells(Asc.c_oAscInsertOptions.InsertRows),
    insertColumns: () => api.asc_insertCells(Asc.c_oAscInsertOptions.InsertColumns),
    deleteRows: () => api.asc_deleteCells(Asc.c_oAscDeleteOptions.DeleteRows),
    deleteColumns: () => api.asc_deleteCells(Asc.c_oAscDeleteOptions.DeleteColumns),
    undo: () => api.asc_Undo(),
    redo: () => api.asc_Redo(),
  };
};

export type SheetCommands = {
  show: (index: number) => void;
  /** Adds a sheet named "Tabelle<n>" with the first free number, and shows it. */
  add: () => void;
  /** Renames the active sheet; false when the name is not allowed or taken. */
  rename: (name: string) => boolean;
  /** Deletes the active sheet; false for the last visible one. */
  remove: () => boolean;
};

/** Characters Excel does not allow in sheet names (web-apps Statusbar.jsx renameWorksheet). */
const BAD_SHEET_NAME = /^'|[:\\/*?[\]]|'$/;

export const isValidSheetName = (name: string, taken: string[]): boolean => {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 31 &&
    !BAD_SHEET_NAME.test(trimmed) &&
    !taken.some((other) => other.toLowerCase() === trimmed.toLowerCase())
  );
};

/** "Tabelle1", "Tabelle2", …: the first name not taken, as German Excel names new sheets. */
export const nextSheetName = (taken: string[]): string => {
  const lower = new Set(taken.map((name) => name.toLowerCase()));
  let index = 1;
  while (lower.has(`tabelle${index}`)) index += 1;
  return `Tabelle${index}`;
};

/** The sheet tabs (cell/api.js, as web-apps' spreadsheeteditor/mobile Statusbar.jsx uses them). */
export const createSheetCommands = (api: CellEngineApi, getState: () => SheetState): SheetCommands => {
  const names = () => getState().sheets.map((sheet) => sheet.name);
  return {
    show: (index) => api.asc_showWorksheet(index),
    add: () => {
      api.asc_closeCellEditor();
      api.asc_addWorksheet(nextSheetName(names()));
    },
    rename: (name) => {
      const active = getState().activeSheet;
      const others = names().filter((_, index) => index !== active);
      if (!isValidSheetName(name, others)) return false;
      if (name.trim() !== names()[active]) api.asc_renameWorksheet(name.trim());
      return true;
    },
    remove: () => {
      if (getState().sheets.filter((sheet) => !sheet.hidden).length <= 1) return false;
      return api.asc_deleteWorksheet() !== false;
    },
  };
};
