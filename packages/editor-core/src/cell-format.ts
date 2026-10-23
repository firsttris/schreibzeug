import type { CellFormat, NumberFormat } from "./cell-state";
import { toTextColor } from "./colors";
import type { EngineCellInfo } from "./engine-types";
import { type AlignConstants, toAlign } from "./events";

/**
 * The number format codes behind the toolbar's choices. The currency code is web-apps' euro format
 * (spreadsheeteditor/mobile EditCell.jsx currencyFormats); the date is written the German way.
 */
export const NUMBER_FORMATS: Record<NumberFormat, string> = {
  general: "General",
  number: "#,##0.00",
  currency: "#,##0.00\\ [$€-407]",
  percent: "0.00%",
  date: "dd.mm.yyyy",
  text: "@",
};

const formatOf = (code: string): NumberFormat | "custom" =>
  (Object.entries(NUMBER_FORMATS).find(([, known]) => known === code)?.[0] as NumberFormat | undefined) ??
  "custom";

/** Reads the active cell's formatting from what asc_onSelectionChanged reports (cell/model/CellInfo.js). */
export const readCellFormat = (
  info: EngineCellInfo,
  aligns: AlignConstants,
  merge: { Merge: number; Disabled: number },
): CellFormat => {
  const xfs = info.asc_getXfs();
  const color = xfs.asc_getFontColor();
  const fill = xfs.asc_getFillColor();
  return {
    bold: Boolean(xfs.asc_getFontBold()),
    italic: Boolean(xfs.asc_getFontItalic()),
    underline: Boolean(xfs.asc_getFontUnderline()),
    strikeout: Boolean(xfs.asc_getFontStrikeout()),
    fontName: xfs.asc_getFontName() || null,
    fontSize: Number.isFinite(xfs.asc_getFontSize()) ? xfs.asc_getFontSize() : null,
    color: color ? toTextColor(color) : null,
    fill: fill ? toTextColor(fill) : null,
    align: toAlign(xfs.asc_getHorAlign(), aligns),
    wrap: Boolean(xfs.asc_getWrapText()),
    numberFormat: formatOf(xfs.asc_getNumFormat()),
    // cell/view/WorksheetView.js: Disabled for one cell, Merge when the range holds a merged cell.
    merged: info.asc_getMerge() === merge.Merge,
    mergeable: info.asc_getMerge() !== merge.Disabled,
  };
};
