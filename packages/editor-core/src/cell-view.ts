import type { CellEngineApi, CellFindOptions, CellWindow } from "./engine-types";
import type { SearchCommands } from "./search";
import { type ContextMenuRequest, clampZoom, type ViewCommands } from "./view";

/** The zoom steps the spreadsheet goes through with "Vergrößern" and "Verkleinern". */
const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400, 500];

const currentPercent = (api: CellEngineApi) => Math.round(api.asc_getZoom() * 100);

/**
 * Clipboard and zoom of the spreadsheet (cell/api.js asc_Copy, asc_Cut, asc_Paste; asc_getZoom and
 * asc_setZoom take a factor, 1 for 100 %). A sheet has no page to fit.
 */
export const createCellViewCommands = (api: CellEngineApi): ViewCommands => ({
  clipboard: (action) => {
    const done = action === "copy" ? api.asc_Copy() : action === "cut" ? api.asc_Cut() : api.asc_Paste();
    return done !== false;
  },
  zoomIn: () => {
    const now = currentPercent(api);
    api.asc_setZoom((ZOOM_STEPS.find((step) => step > now) ?? now) / 100);
  },
  zoomOut: () => {
    const now = currentPercent(api);
    api.asc_setZoom(([...ZOOM_STEPS].reverse().find((step) => step < now) ?? now) / 100);
  },
  setZoom: (percent) => api.asc_setZoom(clampZoom(percent) / 100),
  fitWidth: null,
  fitPage: null,
});

/**
 * Find and replace in the active sheet with an `asc_CFindOptions`, filled as web-apps does
 * (spreadsheeteditor main controller/Search.js onQuerySearch, onQueryReplace). "Whole words" is
 * "whole cell" here, the closest the spreadsheet offers. The cell being typed into is closed first.
 * Matches are marked while the bar is open and unmarked when it closes, as web-apps does
 * (`asc_selectSearchingResults`); the spreadsheet's `asc_endFindText` fails in this build
 * (cell/api.js calls a `_cleanFindResults` WorkbookView.js does not have).
 */
export const createCellSearchCommands = (
  api: CellEngineApi,
  win: Pick<CellWindow, "Asc">,
  noMatches: () => void,
): SearchCommands => {
  const optionsFor = (text: string, matchCase: boolean, wholeCell: boolean): CellFindOptions => {
    const options = new win.Asc.asc_CFindOptions();
    options.asc_setFindWhat(text);
    options.asc_setIsMatchCase(matchCase);
    options.asc_setIsWholeCell(wholeCell);
    options.asc_setLookIn(win.Asc.c_oAscFindLookIn.Value);
    return options;
  };
  const replaceWith = (
    text: string,
    matchCase: boolean,
    wholeCell: boolean,
    replacement: string,
    all: boolean,
  ) => {
    const options = optionsFor(text, matchCase, wholeCell);
    options.asc_setReplaceWith(replacement);
    options.asc_setIsReplaceAll(all);
    api.asc_replaceText(options);
  };
  return {
    find: ({ text, matchCase, wholeWords }, forward) => {
      if (!text) {
        noMatches();
        return 0;
      }
      api.asc_closeCellEditor();
      api.asc_selectSearchingResults(true);
      const options = optionsFor(text, matchCase, wholeWords);
      options.asc_setScanForward(forward);
      const total = api.asc_findText(options) ?? 0;
      if (total === 0) noMatches();
      return total;
    },
    replace: ({ text, matchCase, wholeWords }, replacement) => {
      if (!text) return false;
      replaceWith(text, matchCase, wholeWords, replacement, false);
      return true;
    },
    replaceAll: ({ text, matchCase, wholeWords }, replacement) => {
      if (text) replaceWith(text, matchCase, wholeWords, replacement, true);
    },
    end: () => {
      api.asc_selectSearchingResults(false);
      noMatches();
    },
  };
};

/**
 * A right click in the grid: the spreadsheet hands over the mouse event itself
 * (cell/view/WorkbookView.js onContextMenu), whose point is already in the frame's coordinates,
 * as web-apps reads it (spreadsheeteditor DocumentHolder.js showPopupMenu, event.pageX).
 */
export const toCellContextMenuRequest = (event: { clientX: number; clientY: number } | undefined) =>
  event ? ({ x: event.clientX, y: event.clientY, area: "body" } satisfies ContextMenuRequest) : null;

/**
 * The active sheet as drawing commands for a PDF, as cell/api.js `_downloadAs` makes them for a
 * PDF: the pages it would print (WorkbookView.js calcPagesPrint) drawn by the PDF printer
 * (printSheets).
 */
export const cellPrintCommands = (api: CellEngineApi): Uint8Array => {
  const pages = api.wb.calcPagesPrint();
  return api.wb.printSheets(pages, null).DocumentRenderer.Memory.GetData();
};

/**
 * The active sheet's values as its cells show them, row by row over the used range (ApiRange.GetText
 * in cell/apiBuilder.js: a single cell's value alone, more cells as rows): what a CSV file holds.
 */
export const sheetText = (api: CellEngineApi): string[][] => {
  const text = api.getJsApi().GetActiveSheet().GetUsedRange().GetText();
  return typeof text === "string" ? [[text]] : text;
};
