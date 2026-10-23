import type { WordEngineApi } from "./engine-types";
import { type AlignConstants, fromAlign } from "./events";
import type { Align, EditorState } from "./state";

export type TextCommands = {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  setFontSize: (size: number) => void;
  setAlign: (align: Align) => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
};

export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 300;

export const clampFontSize = (size: number): number =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size * 2) / 2));

/**
 * Toolbar commands on the engine. Toggles read the current state, because sdkjs takes the target
 * value (word/api.js `put_TextPrBold(value)`), not a toggle.
 */
export const createTextCommands = (
  api: WordEngineApi,
  getState: () => EditorState,
  aligns: AlignConstants,
): TextCommands => ({
  toggleBold: () => api.put_TextPrBold(!getState().text.bold),
  toggleItalic: () => api.put_TextPrItalic(!getState().text.italic),
  toggleUnderline: () => api.put_TextPrUnderline(!getState().text.underline),
  setFontSize: (size) => api.put_TextPrFontSize(clampFontSize(size)),
  setAlign: (align) => api.put_PrAlign(fromAlign(align, aligns)),
  selectAll: () => api.asc_EditSelectAll(),
  undo: () => api.Undo(),
  redo: () => api.Redo(),
});
