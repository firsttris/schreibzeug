/**
 * Highlighting text and copying formatting, as web-apps' highlight colour and "copy style"
 * buttons do (documenteditor main controller/Toolbar.js _setMarkerColor, onCopyStyleToggle).
 */

/** "#rrggbb". */
export type HighlightColor = string;

/** The first colours of web-apps' highlight palette (view/Toolbar.js mnuHighlightColorPicker). */
export const HIGHLIGHT_COLORS: readonly HighlightColor[] = [
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#ff00ff",
  "#ff0000",
];

/** word/api.js, the calls behind these commands. */
export type MarkingApi = {
  /**
   * `true` highlights the selected text (CDocument.SetParagraphHighlight; `isColor` false takes the
   * highlight away) and leaves the mouse a highlighter until Escape; `false` ends that.
   */
  SetMarkerFormat(value: boolean, isColor?: boolean, r?: number, g?: number, b?: number): void;
  /** 1 copies the formatting at the cursor and applies it to the next selection; 0 stops. */
  SetPaintFormat(state: number): void;
};

/**
 * CTextProp.get_HighLight (word/apiCommon.js): an AscCommon.CColor, highlight_None (-1), or null
 * for a selection that mixes. The event asc_onTextHighLight itself turns -1 into black, so web-apps
 * reads the text properties instead (controller/Toolbar.js onApiHighlightColor), and so does this.
 */
export type EngineHighlight = { r: number; g: number; b: number } | number | null | undefined;

const hex = (value: number) => value.toString(16).padStart(2, "0");

export const readHighlight = (color: EngineHighlight): HighlightColor | null =>
  color && typeof color === "object" ? `#${hex(color.r)}${hex(color.g)}${hex(color.b)}` : null;

export type MarkingCommands = {
  /** null takes the highlight away. */
  highlight: (color: HighlightColor | null) => void;
  /** Copies the formatting at the cursor to the text selected next, or stops doing so. */
  togglePaintFormat: (on: boolean) => void;
};

/** c_oAscFormatPainterState (common/commonDefines.js): kOff 0, kOn 1. */
const PAINTER = { off: 0, on: 1 } as const;

/** The selection is highlighted, as in Google Docs; the mouse does not stay a highlighter. */
export const createMarkingCommands = (api: MarkingApi): MarkingCommands => ({
  highlight: (color) => {
    if (!color) api.SetMarkerFormat(true, false);
    else {
      const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
      api.SetMarkerFormat(true, true, r, g, b);
    }
    api.SetMarkerFormat(false);
  },
  togglePaintFormat: (on) => api.SetPaintFormat(on ? PAINTER.on : PAINTER.off),
});
