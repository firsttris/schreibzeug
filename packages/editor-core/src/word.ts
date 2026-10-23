import type { CollabChannel } from "./collab";
import { createEngineColor } from "./colors";
import { createTextCommands, type TextCommands } from "./commands";
import { type CommentCommands, createCommentCommands } from "./comments";
import type { Convert } from "./converter";
import type { EngineEventArgs, EngineEventName, EngineWindow, WordEngineApi } from "./engine-types";
import { type EventTranslators, stateEvents } from "./events";
import { keepFocusOnClick } from "./frame";
import { createFrameSocketIO } from "./frame-socket";
import { readListKind } from "./lists";
import { type EditorEvent, type EditorState, initialEditorState, reduceEditorState } from "./state";
import { createStore, type Store } from "./store";

export type DocumentUser = { id: string; name: string };

export type OpenWordOptions = {
  /** The .docx file. */
  bytes: Uint8Array;
  title: string;
  user: DocumentUser;
  /** Turns the .docx into the engine's binary format and back (converter.ts). */
  convert: Convert;
  lang?: string;
  /** How long to wait until the document is shown, in milliseconds. */
  timeoutMs?: number;
  /**
   * Edit together with others: the relay session (collab.ts joinSession) and the id every
   * participant uses for this document. `bytes` must be the session's base version.
   */
  collaboration?: { channel: CollabChannel; documentId: string };
};

export type WordEditor = {
  store: Store<EditorState>;
  commands: TextCommands;
  comments: CommentCommands;
  /** The document as .docx: the engine's binary, converted in the browser. */
  save: () => Promise<Uint8Array>;
  /** Tells the engine the current state is stored, so "modified" turns false until the next change. */
  markSaved: () => void;
  resize: () => void;
  close: () => void;
};

/** common/errorCodes.js `c_oAscError.Level.Critical`: the document cannot be used. */
const CRITICAL_ERROR_LEVEL = -1;

/** sdkjs `SetFontRenderingMode`: 3 = hinting for normal screens, 1 = none for high-DPI (web-apps uses the same). */
const fontRenderingMode = (devicePixelRatio: number): number => (devicePixelRatio > 1 ? 1 : 3);

const subscribe = (
  api: WordEngineApi,
  translators: EventTranslators,
  dispatch: (event: EditorEvent) => void,
): void => {
  for (const name of Object.keys(translators) as EngineEventName[]) {
    const translate = translators[name] as (...args: EngineEventArgs[typeof name]) => EditorEvent | null;
    api.asc_registerCallback(name, (...args) => {
      const event = translate(...args);
      if (event) dispatch(event);
    });
  }
};

const createDocInfo = (win: EngineWindow, options: OpenWordOptions, url: string) => {
  const user = new win.Asc.asc_CUserInfo();
  user.put_Id(options.user.id);
  user.put_FullName(options.user.name);

  const info = new win.Asc.asc_CDocInfo();
  info.put_Id(options.collaboration?.documentId ?? crypto.randomUUID());
  info.put_Url(url);
  info.put_Title(options.title);
  info.put_Format("docx");
  info.put_UserInfo(user);
  info.put_Permissions({ edit: true, download: true, print: true, comment: true, review: true });
  info.put_Mode("edit");
  info.put_Lang(options.lang ?? "de");
  // Fast co-editing, as web-apps chooses by default (documenteditor/mobile Main.jsx coEditMode).
  if (options.collaboration) info.put_CoEditingMode("fast");
  return info;
};

/**
 * put_ListTypeCustom applies the list in a promise and the selection does not move, so no
 * asc_onFocusObject follows; the list at the cursor is read again once it is applied.
 */
const withListRefresh = (commands: TextCommands, refreshList: () => void): TextCommands => ({
  ...commands,
  toggleList: (kind) => commands.toggleList(kind).then(refreshList),
});

/**
 * Where the engine gets the document from, and whether it talks to anyone.
 *
 * Alone: the offline URL makes sdkjs skip the Document Server (no socket, a local license answer)
 * and ask for the file through `_openChartOrLocalDocument`, which gets our bytes
 * (common/apiBase.js asc_setDocInfo, _coAuthoringInit).
 *
 * Together: sdkjs connects with what it finds in `window.io` (frame-socket.ts) and, after `auth`,
 * opens the "Editor.bin" URL the relay names in `documentOpen`, which is the URL it was given:
 * our binary as a blob in the frame, the same bytes for every participant.
 */
const connectEngine = (
  win: EngineWindow,
  api: WordEngineApi,
  binary: Uint8Array,
  collaboration: OpenWordOptions["collaboration"],
): string => {
  if (!collaboration) {
    api._openChartOrLocalDocument = () => api.asc_openDocumentFromBytes(binary);
    return win.AscCommon.offlineMode;
  }
  win.io = createFrameSocketIO(win, collaboration.channel);
  return win.URL.createObjectURL(new win.Blob([binary as BlobPart]));
};

/**
 * What web-apps switches on once a shared document is shown (common/mobile/lib/controller/
 * collaboration/Collaboration.jsx onDocumentReady): changes go out as they happen, every second,
 * and others' text is not highlighted. Without the autosave gap the engine sends nothing.
 */
const startCoEditing = (win: EngineWindow, api: WordEngineApi): void => {
  api.asc_SetFastCollaborative(true);
  api.SetCollaborativeMarksShowType(win.Asc.c_oAscCollaborativeMarksShowType.None);
  api.asc_setAutoSaveGap(1);
};

type EngineStart = {
  win: EngineWindow;
  binary: Uint8Array;
  options: OpenWordOptions;
  store: Store<EditorState>;
  dispatch: (event: EditorEvent) => void;
  onReady: (editor: WordEditor) => void;
  onFailure: (message: string) => void;
};

/**
 * Starts the engine on a document in its binary format. The sequence follows the mobile editor in
 * Euro-Office/web-apps (apps/documenteditor/mobile/src/controller/Main.jsx): create the API, set the
 * document info, ask for permissions, load. In offline mode sdkjs asks for the file through
 * `_openChartOrLocalDocument`, which normally opens an empty document; here it gets our bytes.
 */
const startEngine = ({ win, binary, options, store, dispatch, onReady, onFailure }: EngineStart): void => {
  const api = new win.Asc.asc_docs_api({ "id-view": "editor_sdk", translate: {} });
  api.SetFontRenderingMode(fontRenderingMode(win.devicePixelRatio));
  const url = connectEngine(win, api, binary, options.collaboration);
  subscribe(api, stateEvents(win.AscCommon, win.Asc.c_oAscAsyncAction.Disconnect), dispatch);
  keepFocusOnClick(win, () => api.getFocusElement());
  const refreshList = () =>
    dispatch({ type: "list", value: readListKind(api, win.Asc.c_oAscNumberingFormat) });
  api.asc_registerCallback("asc_onFocusObject", (objects) => {
    refreshList();
    const table = win.Asc.c_oAscTypeSelectElement.Table;
    dispatch({ type: "inTable", value: objects.some((object) => object.asc_getObjectType() === table) });
  });
  // The event carries no value; web-apps reads the flag on it (documenteditor/mobile Main.jsx).
  api.asc_registerCallback("asc_onDocumentModifiedChanged", () =>
    dispatch({ type: "modified", value: api.isDocumentModified() }),
  );

  const editor: WordEditor = {
    store,
    commands: withListRefresh(
      createTextCommands(api, store.get, win.AscCommon, createEngineColor(win.Asc.asc_CColor)),
      refreshList,
    ),
    // word/api.js asc_nativeGetFile: the document as "DOCY;v5;<size>;<base64>", which x2t reads.
    save: () => options.convert(new TextEncoder().encode(api.asc_nativeGetFile()), "bin", "docx"),
    comments: createCommentCommands(
      api,
      store.get,
      options.user,
      () => new win.Asc.asc_CCommentDataWord(null),
    ),
    markSaved: () => api.SetUnchangedDocument(),
    resize: () => api.Resize(),
    close: () => api.asc_CloseFile?.(),
  };

  api.asc_registerCallback("asc_onGetEditorPermissions", () => api.asc_LoadDocument());
  api.asc_registerCallback("asc_onDocumentContentReady", () => {
    // Spell checking needs the Document Server's dictionary service, which Stapel does not run:
    // without it every word is marked. web-apps switches it here too (documenteditor/mobile Main.jsx).
    api.asc_setSpellCheck(false);
    // Marks commented text and reports the comments at the cursor (asc_onShowComment), as web-apps
    // does with live commenting on; resolved comments stay unmarked.
    api.asc_showComments(false);
    if (options.collaboration) startCoEditing(win, api);
    api.Resize();
    api.zoomFitToWidth();
    onReady(editor);
  });
  api.asc_registerCallback("asc_onError", (id, level) => {
    if (level === CRITICAL_ERROR_LEVEL) onFailure(`The engine reported error ${id}.`);
  });

  api.asc_setDocInfo(createDocInfo(win, options, url));
  api.asc_getEditorPermissions();
};

/**
 * Opens a .docx in the engine of an already mounted frame. The engine of this build reads only its
 * binary format — its OOXML reader (CDocument.fromZip) is not part of Euro-Office — so the file is
 * converted with x2t first, and saving converts back.
 */
export const openWordDocument = (win: EngineWindow, options: OpenWordOptions): Promise<WordEditor> => {
  const store = createStore<EditorState>(initialEditorState);
  const dispatch = (event: EditorEvent) => store.set((state) => reduceEditorState(state, event));

  return new Promise<WordEditor>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish();
    };
    const onFailure = (message: string) =>
      settle(() => {
        dispatch({ type: "error", message });
        reject(new Error(message));
      });
    const onReady = (editor: WordEditor) =>
      settle(() => {
        dispatch({ type: "ready" });
        resolve(editor);
      });
    const timer = setTimeout(
      () => onFailure("The document did not open in time."),
      options.timeoutMs ?? 60_000,
    );

    options
      .convert(options.bytes, "docx", "bin")
      .then((binary) => startEngine({ win, binary, options, store, dispatch, onReady, onFailure }))
      .catch((error: unknown) => onFailure(error instanceof Error ? error.message : String(error)));
  });
};
