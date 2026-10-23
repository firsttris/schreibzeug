import { toTextColor } from "./colors";
import { readComment } from "./comments";
import type { CoreEvent } from "./core-state";
import type { CommonEventArgs, TextEventArgs, WordEventArgs } from "./engine-types";
import type { Align, EditorEvent, TextEvent } from "./state";

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

/** Font names without duplicates, in the order a person looks for them. */
export const uniqueSorted = (names: string[]): string[] =>
  [...new Set(names.filter((name) => name.length > 0))].sort((a, b) => a.localeCompare(b, "de"));

/** Turns the arguments of engine events into the editor's events; null when there is nothing to tell. */
export type Translators<Events, Out> = {
  [N in keyof Events]?: (...args: Extract<Events[N], unknown[]>) => Out | null;
};

export type EventTranslators = Translators<WordEventArgs, EditorEvent>;

/**
 * The engine starts its "Disconnect" action when the connection to the other editors drops and
 * ends it once the session is restored (common/apiBase.js CoAuthoringApi.onDisconnect and
 * onConnectionStateChanged; the id is c_oAscAsyncAction.Disconnect in common/commonDefines.js).
 */
const connectionEvent = (disconnect: number, connected: boolean) => (_type: number, id: number) =>
  id === disconnect ? ({ type: "connected", value: connected } as const) : null;

/** What every editor's engine tells the same way. */
export const coreEvents = (disconnectAction: number): Translators<CommonEventArgs, CoreEvent> => ({
  asc_onStartAction: connectionEvent(disconnectAction, false),
  asc_onEndAction: connectionEvent(disconnectAction, true),
});

/** Character formatting, the fonts and the history, told the same by the text and the presentation engine. */
export const textEvents = (aligns: AlignConstants): Translators<TextEventArgs, TextEvent | CoreEvent> => ({
  asc_onBold: (value) => ({ type: "bold", value: Boolean(value) }),
  asc_onItalic: (value) => ({ type: "italic", value: Boolean(value) }),
  asc_onUnderline: (value) => ({ type: "underline", value: Boolean(value) }),
  asc_onStrikeout: (value) => ({ type: "strikeout", value: Boolean(value) }),
  asc_onTextColor: (color) => ({ type: "color", value: toTextColor(color) }),
  asc_onInitEditorFonts: (fonts) => ({
    type: "fonts",
    value: uniqueSorted(fonts.map((font) => font.asc_getFontName())),
  }),
  asc_onFontSize: (value) => (Number.isFinite(value) ? { type: "fontSize", value } : null),
  asc_onFontFamily: (family) => ({ type: "fontName", value: family?.asc_getName() || null }),
  asc_onPrAlign: (value) => ({ type: "align", value: toAlign(value, aligns) }),
  asc_onCanUndo: (value) => ({ type: "canUndo", value: Boolean(value) }),
  asc_onCanRedo: (value) => ({ type: "canRedo", value: Boolean(value) }),
  asc_onCountPages: (value) => ({ type: "pages", value }),
});

/**
 * Engine events that become state. Each entry turns the arguments of one sdkjs event into an
 * EditorEvent; events not listed here are handled by the open/close flow in word.ts.
 */
export const stateEvents = (aligns: AlignConstants, disconnectAction: number): EventTranslators => ({
  ...coreEvents(disconnectAction),
  ...textEvents(aligns),
  asc_onAddComment: (id, data) => ({ type: "commentSet", comment: readComment(id, data) }),
  asc_onChangeCommentData: (id, data) => ({ type: "commentSet", comment: readComment(id, data) }),
  asc_onRemoveComment: (id) => ({ type: "commentRemoved", id }),
  asc_onShowComment: (ids) => ({ type: "activeComments", ids: [...ids] }),
  asc_onHideComment: () => ({ type: "activeComments", ids: [] }),
  asc_onParaStyleName: (name) => ({ type: "style", value: name || null }),
  asc_onInitEditorStyles: (styles) => ({
    type: "styles",
    value: [...new Set(styles.get_MergedStyles().map((style) => style.get_Name()))],
  }),
});
