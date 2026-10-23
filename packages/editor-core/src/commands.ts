import type { TextColor } from "./colors";
import type { EngineColor, WordEngineApi } from "./engine-types";
import { type AlignConstants, fromAlign } from "./events";
import { LIST_PRESETS } from "./lists";
import type { Align, EditorState, ListKind } from "./state";

export type TextCommands = {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikeout: () => void;
  setFontSize: (size: number) => void;
  setFontName: (name: string) => void;
  setColor: (color: TextColor) => void;
  setStyle: (name: string) => void;
  /** Starts a list of this kind, or ends it when the paragraph is in one already; resolves once applied. */
  toggleList: (kind: ListKind) => Promise<void>;
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
  engineColor: (color: TextColor) => EngineColor,
): TextCommands => ({
  toggleBold: () => api.put_TextPrBold(!getState().text.bold),
  toggleItalic: () => api.put_TextPrItalic(!getState().text.italic),
  toggleUnderline: () => api.put_TextPrUnderline(!getState().text.underline),
  toggleStrikeout: () => api.put_TextPrStrikeout(!getState().text.strikeout),
  setFontSize: (size) => api.put_TextPrFontSize(clampFontSize(size)),
  setFontName: (name) => api.put_TextPrFontName(name),
  setColor: (color) => api.put_TextColor(engineColor(color)),
  setStyle: (name) => api.put_Style(name),
  toggleList: async (kind) => {
    await api.put_ListTypeCustom(
      getState().paragraph.list === kind ? LIST_PRESETS.remove : LIST_PRESETS[kind],
    );
  },
  setAlign: (align) => api.put_PrAlign(fromAlign(align, aligns)),
  selectAll: () => api.asc_EditSelectAll(),
  undo: () => api.Undo(),
  redo: () => api.Redo(),
});
