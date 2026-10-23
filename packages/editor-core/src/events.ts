import type { EngineEventArgs, EngineEventName } from "./engine-types";
import type { Align, EditorEvent } from "./state";

/** Paragraph alignment values from common/commonDefines.js (align_Right = 0 … align_Justify = 3). */
export type AlignConstants = {
  align_Right: number;
  align_Left: number;
  align_Center: number;
  align_Justify: number;
};

export const toAlign = (value: number, constants: AlignConstants): Align | null => {
  if (value === constants.align_Left) return "left";
  if (value === constants.align_Center) return "center";
  if (value === constants.align_Right) return "right";
  if (value === constants.align_Justify) return "justify";
  return null;
};

export const fromAlign = (align: Align, constants: AlignConstants): number =>
  ({
    left: constants.align_Left,
    center: constants.align_Center,
    right: constants.align_Right,
    justify: constants.align_Justify,
  })[align];

type Translator<N extends EngineEventName> = (...args: EngineEventArgs[N]) => EditorEvent | null;

export type EventTranslators = { [N in EngineEventName]?: Translator<N> };

/**
 * Engine events that become state. Each entry turns the arguments of one sdkjs event into an
 * EditorEvent; events not listed here are handled by the open/close flow in word.ts.
 */
export const stateEvents = (aligns: AlignConstants): EventTranslators => ({
  asc_onBold: (value) => ({ type: "bold", value: Boolean(value) }),
  asc_onItalic: (value) => ({ type: "italic", value: Boolean(value) }),
  asc_onUnderline: (value) => ({ type: "underline", value: Boolean(value) }),
  asc_onFontSize: (value) => (Number.isFinite(value) ? { type: "fontSize", value } : null),
  asc_onFontFamily: (family) => ({ type: "fontName", value: family?.asc_getName() || null }),
  asc_onPrAlign: (value) => ({ type: "align", value: toAlign(value, aligns) }),
  asc_onCanUndo: (value) => ({ type: "canUndo", value: Boolean(value) }),
  asc_onCanRedo: (value) => ({ type: "canRedo", value: Boolean(value) }),
  asc_onDocumentModifiedChanged: (value) => ({ type: "modified", value: Boolean(value) }),
  asc_onCountPages: (value) => ({ type: "pages", value }),
});
