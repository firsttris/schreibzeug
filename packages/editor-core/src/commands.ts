import type { TextColor } from "./colors";
import type { CharacterApi, EngineColor, WordEngineApi } from "./engine-types";
import { type AlignConstants, type BaselineConstants, fromAlign, fromBaseline } from "./events";
import { LIST_PRESETS } from "./lists";
import type { Align, Baseline, EditorState, ListKind, TextState } from "./state";

/** Character formatting and history, the same in the text and the presentation editor. */
export type CharacterCommands = {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikeout: () => void;
  setFontSize: (size: number) => void;
  setFontName: (name: string) => void;
  setColor: (color: TextColor) => void;
  setAlign: (align: Align) => void;
  /** Raises or lowers the selection; the same baseline again puts it back on the line. */
  toggleBaseline: (baseline: Exclude<Baseline, "normal">) => void;
  clearFormatting: () => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
};

export type TextCommands = CharacterCommands & {
  setStyle: (name: string) => void;
  /** Starts a list of this kind, or ends it when the paragraph is in one already; resolves once applied. */
  toggleList: (kind: ListKind) => Promise<void>;
  insertTable: (columns: number, rows: number) => void;
  addRow: (where: "above" | "below") => void;
  addColumn: (where: "left" | "right") => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
  insertPageBreak: () => void;
};

export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 300;

/** Word allows up to 63 columns; more rows than this are added later, not in one go. */
export const MAX_TABLE_SIZE = 63;

export const clampTableSize = (size: number): number =>
  Math.min(MAX_TABLE_SIZE, Math.max(1, Math.round(size)));

export const clampFontSize = (size: number): number =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size * 2) / 2));

/**
 * Toolbar commands on the engine. Toggles read the current state, because sdkjs takes the target
 * value (word/api.js and slide/api.js `put_TextPrBold(value)`), not a toggle.
 */
export const createCharacterCommands = (
  api: CharacterApi,
  getText: () => TextState,
  constants: AlignConstants & BaselineConstants,
  engineColor: (color: TextColor) => EngineColor,
): CharacterCommands => ({
  toggleBold: () => api.put_TextPrBold(!getText().bold),
  toggleItalic: () => api.put_TextPrItalic(!getText().italic),
  toggleUnderline: () => api.put_TextPrUnderline(!getText().underline),
  toggleStrikeout: () => api.put_TextPrStrikeout(!getText().strikeout),
  setFontSize: (size) => api.put_TextPrFontSize(clampFontSize(size)),
  setFontName: (name) => api.put_TextPrFontName(name),
  setColor: (color) => api.put_TextColor(engineColor(color)),
  setAlign: (align) => api.put_PrAlign(fromAlign(align, constants)),
  toggleBaseline: (baseline) =>
    api.put_TextPrBaseline(fromBaseline(getText().baseline === baseline ? "normal" : baseline, constants)),
  clearFormatting: () => api.ClearFormating(),
  selectAll: () => api.asc_EditSelectAll(),
  undo: () => api.Undo(),
  redo: () => api.Redo(),
});

/** The text editor's commands: character formatting, styles, lists and tables. */
export const createTextCommands = (
  api: WordEngineApi,
  getState: () => EditorState,
  constants: AlignConstants & BaselineConstants,
  engineColor: (color: TextColor) => EngineColor,
): TextCommands => ({
  ...createCharacterCommands(api, () => getState().text, constants, engineColor),
  setStyle: (name) => api.put_Style(name),
  toggleList: async (kind) => {
    await api.put_ListTypeCustom(
      getState().paragraph.list === kind ? LIST_PRESETS.remove : LIST_PRESETS[kind],
    );
  },
  insertTable: (columns, rows) => api.put_Table(clampTableSize(columns), clampTableSize(rows)),
  addRow: (where) => (where === "above" ? api.addRowAbove() : api.addRowBelow()),
  addColumn: (where) => (where === "left" ? api.addColumnLeft() : api.addColumnRight()),
  deleteRow: () => api.remRow(),
  deleteColumn: () => api.remColumn(),
  deleteTable: () => api.remTable(),
  insertPageBreak: () => api.put_AddPageBreak(),
});
