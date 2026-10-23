import {
  type CellCommands,
  createCellCommands,
  createSheetCommands,
  type SheetCommands,
} from "./cell-commands";
import { readCellFormat } from "./cell-format";
import { initialSheetState, reduceSheetState, type SheetEvent, type SheetState } from "./cell-state";
import { createEngineColor } from "./colors";
import { type EditorBinding, type OpenedDocument, type OpenOptions, openDocument } from "./document";
import type { CellEngineApi, CellEventArgs, CellWindow, EngineWindow } from "./engine-types";
import { uniqueSorted } from "./events";
import { fontRenderingMode } from "./word";

export type SheetEditor = OpenedDocument<SheetState> & {
  commands: CellCommands;
  sheets: SheetCommands;
};

/** German regional format: decimal comma, "." between thousands, ";" between function arguments. */
const GERMAN_LCID = 0x0407;

/** The formula bar's input in the frame page (engine/frame/editor/cell/main/index.html). */
const FORMULA_INPUT_ID = "ce-cell-content";
const NAME_BOX_ID = "name-box";

const readSheets = (api: CellEngineApi): SheetEvent => {
  const count = api.asc_getWorksheetsCount();
  const sheets = Array.from({ length: count }, (_, index) => ({
    name: api.asc_getWorksheetName(index),
    hidden: api.asc_isWorksheetHidden(index),
  }));
  return { type: "sheets", sheets, active: api.asc_getActiveWorksheetIndex() };
};

/**
 * On open the engine unregisters a callback of its own for asc_onSelectionChanged (cell/api.js,
 * "Toggle chart elements") before registering it. Its handler list deletes the whole event when it
 * holds a single function rather than a list (cell/view/HandlerList.js remove), which would take our
 * callback with it. A first, empty callback makes it a list, from which only the engine's is removed.
 */
const keepSelectionCallbacks = (api: CellEngineApi) =>
  api.asc_registerCallback("asc_onSelectionChanged", () => {});

/**
 * The name box beside the formula bar: shows the selection's reference and jumps to one typed in
 * (cell/api.js asc_findCell), as the desktop editor's name box does.
 */
const connectNameBox = (win: CellWindow, api: CellEngineApi) => {
  const box = win.document.getElementById(NAME_BOX_ID) as HTMLInputElement | null;
  box?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !box.value.trim()) return;
    event.preventDefault();
    api.asc_findCell(box.value.trim());
    // Back to the grid, so typing goes into the cell that was jumped to.
    api.getFocusElement().focus();
  });
  return (reference: string) => {
    if (box && win.document.activeElement !== box) box.value = reference;
  };
};

/**
 * The spreadsheet editor (cell/api.js) on top of the shared opening flow (document.ts). Callbacks
 * registered with this engine must be plain functions: its handler list calls only what
 * `asc_typeOf` calls "function", which leaves out async functions (cell/view/HandlerList.js).
 */
const cellBinding: EditorBinding<
  CellWindow,
  CellEventArgs,
  CellEngineApi,
  SheetState,
  SheetEvent,
  Pick<SheetEditor, "commands" | "sheets">
> = {
  format: "xlsx",
  createApi: (win) => {
    // The same options as web-apps (spreadsheeteditor/mobile Main.jsx), with our formula bar.
    const api = new win.Asc.spreadsheet_api({ "id-view": "editor_sdk", "id-input": FORMULA_INPUT_ID });
    api.asc_setFontRenderingMode(fontRenderingMode(win.devicePixelRatio));
    // Stored until the full API has loaded (cell/api.js asc_setLocale, tmpLCID).
    api.asc_setLocale(GERMAN_LCID);
    keepSelectionCallbacks(api);
    return api;
  },
  initialState: initialSheetState,
  reduce: reduceSheetState,
  events: (win) => ({
    asc_onSelectionChanged: (info) => ({
      type: "cell",
      value: readCellFormat(info, win.AscCommon, win.Asc.c_oAscMergeOptions),
    }),
    asc_onCanUndoChanged: (value) => ({ type: "canUndo", value: Boolean(value) }),
    asc_onCanRedoChanged: (value) => ({ type: "canRedo", value: Boolean(value) }),
    asc_onInitEditorFonts: (fonts) => ({
      type: "fonts",
      value: uniqueSorted(fonts.map((font) => font.asc_getFontName())),
    }),
  }),
  setup: ({ win, api, store, dispatch }) => {
    const showReference = connectNameBox(win, api);
    api.asc_registerCallback("asc_onSelectionNameChanged", (name) => {
      const reference = typeof name === "string" ? name : name.asc_getName();
      showReference(reference);
      dispatch({ type: "reference", value: reference });
    });
    const refreshSheets = () => dispatch(readSheets(api));
    api.asc_registerCallback("asc_onSheetsChanged", refreshSheets);
    api.asc_registerCallback("asc_onActiveSheetChanged", refreshSheets);
    // The tabs and the active cell as the document opens; the events above follow the changes.
    api.asc_registerCallback("asc_onDocumentContentReady", () => {
      refreshSheets();
      dispatch({
        type: "cell",
        value: readCellFormat(api.asc_getCellInfo(), win.AscCommon, win.Asc.c_oAscMergeOptions),
      });
    });
    return {
      commands: createCellCommands(
        api,
        store.get,
        { aligns: win.AscCommon, Asc: win.Asc },
        createEngineColor(win.Asc.asc_CColor),
      ),
      sheets: createSheetCommands(api, store.get),
    };
  },
  // web-apps shows the active sheet and resizes once the document is ready (Main.jsx onDocumentContentReady).
  contentReady: (api) => {
    api.asc_showWorksheet(api.asc_getActiveWorksheetIndex());
    api.asc_Resize();
  },
  resize: (api) => api.asc_Resize(),
  // The spreadsheet has no SetUnchangedDocument; in a shared session its "modified" flag drops once
  // the relay has the changes (cell/api.js asc_isDocumentModified, History.Have_Changes).
  markUnchanged: () => {},
};

/** Opens an .xlsx in the spreadsheet engine of a frame mounted with kind "cell" (see document.ts). */
export const openSheetDocument = (win: EngineWindow, options: OpenOptions): Promise<SheetEditor> =>
  openDocument(win as CellWindow, options, cellBinding);
