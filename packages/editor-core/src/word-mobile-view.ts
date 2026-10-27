/**
 * The text engine's mobile view (word/Drawing/HtmlPage.js ChangeReaderMode with isNewReaderMode):
 * the text flows in the width of the screen at a size to read and stays editable, as web-apps'
 * mobile text editor opens every document on a phone (documenteditor/mobile Main.jsx,
 * "mobile-view"). It is a layout only (word/Editor/Document.js SetDocumentReadMode,
 * word/Editor/Layout/ReadView.js, set without history): the document and the saved file stay as
 * they are. The rulers measure the page, so they go with it.
 */
import type { WordEngineApi } from "./engine-types";

export type MobileViewCommands = {
  /** Shows the text in the mobile view, or the pages again. */
  set: (on: boolean) => void;
};

type MobileViewApi = Pick<WordEngineApi, "ChangeReaderMode" | "asc_SetViewRulers" | "zoomFitToWidth"> & {
  WordControl: Pick<WordEngineApi["WordControl"], "IsReaderMode" | "m_oLogicDocument">;
};

export const createMobileViewCommands = (api: MobileViewApi): MobileViewCommands => ({
  set: (on) => {
    // ChangeReaderMode switches; the engine says which way it stands.
    if (api.WordControl.IsReaderMode() !== on) api.ChangeReaderMode();
    api.asc_SetViewRulers(!on);
    api.zoomFitToWidth();
  },
});

/**
 * Runs `draw` on the pages, also while the mobile view shows: the PDF and printing need the
 * document's own pages. The pages are laid out at once, as word/api.js asc_Print does before it
 * prints (RecalculateAllAtOnce); the mobile view comes back afterwards.
 */
export const onPages = <T>(api: MobileViewApi, draw: () => T): T => {
  if (!api.WordControl.IsReaderMode()) return draw();
  api.ChangeReaderMode();
  api.WordControl.m_oLogicDocument.RecalculateAllAtOnce(true);
  try {
    return draw();
  } finally {
    api.ChangeReaderMode();
  }
};
