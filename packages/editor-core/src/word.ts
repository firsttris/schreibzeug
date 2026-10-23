import { createEngineColor } from "./colors";
import { createTextCommands, type TextCommands } from "./commands";
import { type CommentCommands, createCommentCommands } from "./comments";
import { type EditorBinding, type OpenedDocument, type OpenOptions, openDocument } from "./document";
import type { EngineWindow, WordEngineApi, WordEventArgs, WordWindow } from "./engine-types";
import { stateEvents } from "./events";
import { readListKind } from "./lists";
import {
  type EditorEvent,
  type EditorState,
  initialEditorState,
  reduceEditorState,
  type WordEvent,
} from "./state";

export type OpenWordOptions = OpenOptions;

export type WordEditor = OpenedDocument<EditorState> & {
  commands: TextCommands;
  comments: CommentCommands;
};

/** sdkjs `SetFontRenderingMode`: 3 = hinting for normal screens, 1 = none for high-DPI (web-apps uses the same). */
export const fontRenderingMode = (devicePixelRatio: number): number => (devicePixelRatio > 1 ? 1 : 3);

/**
 * put_ListTypeCustom applies the list in a promise and the selection does not move, so no
 * asc_onFocusObject follows; the list at the cursor is read again once it is applied.
 */
const withListRefresh = (commands: TextCommands, refreshList: () => void): TextCommands => ({
  ...commands,
  toggleList: (kind) => commands.toggleList(kind).then(refreshList),
});

/** The text editor (word/api.js) on top of the shared opening flow (document.ts). */
const wordBinding: EditorBinding<
  WordWindow,
  WordEventArgs,
  WordEngineApi,
  EditorState,
  WordEvent,
  Pick<WordEditor, "commands" | "comments">
> = {
  format: "docx",
  createApi: (win) => {
    const api = new win.Asc.asc_docs_api({ "id-view": "editor_sdk", translate: {} });
    api.SetFontRenderingMode(fontRenderingMode(win.devicePixelRatio));
    return api;
  },
  initialState: initialEditorState,
  reduce: (state, event) => reduceEditorState(state, event as EditorEvent),
  events: (win) => stateEvents(win.AscCommon, win.Asc.c_oAscAsyncAction.Disconnect),
  setup: ({ win, api, store, dispatch, options }) => {
    const refreshList = () =>
      dispatch({ type: "list", value: readListKind(api, win.Asc.c_oAscNumberingFormat) });
    api.asc_registerCallback("asc_onFocusObject", (objects) => {
      refreshList();
      const table = win.Asc.c_oAscTypeSelectElement.Table;
      dispatch({ type: "inTable", value: objects.some((object) => object.asc_getObjectType() === table) });
    });
    return {
      commands: withListRefresh(
        createTextCommands(api, store.get, win.AscCommon, createEngineColor(win.Asc.asc_CColor)),
        refreshList,
      ),
      comments: createCommentCommands(
        api,
        store.get,
        options.user,
        () => new win.Asc.asc_CCommentDataWord(null),
      ),
    };
  },
  contentReady: (api, win, shared) => {
    // Spell checking needs the Document Server's dictionary service, which Stapel does not run:
    // without it every word is marked. web-apps switches it here too (documenteditor/mobile Main.jsx).
    api.asc_setSpellCheck(false);
    // Marks commented text and reports the comments at the cursor (asc_onShowComment), as web-apps
    // does with live commenting on; resolved comments stay unmarked.
    api.asc_showComments(false);
    // Others' text is not highlighted; web-apps sets this for the text editor only (Collaboration.jsx).
    if (shared) api.SetCollaborativeMarksShowType(win.Asc.c_oAscCollaborativeMarksShowType.None);
    api.Resize();
    api.zoomFitToWidth();
  },
  resize: (api) => api.Resize(),
  // word/api.js: marks the current state as saved and sends asc_onDocumentModifiedChanged.
  markUnchanged: (api) => api.SetUnchangedDocument(),
};

/** Opens a .docx in the text engine of a frame mounted with kind "word" (see document.ts). */
export const openWordDocument = (win: EngineWindow, options: OpenWordOptions): Promise<WordEditor> =>
  openDocument(win as WordWindow, options, wordBinding);
