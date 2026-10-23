import { createTextCommands, type TextCommands } from "./commands";
import type { EngineEventArgs, EngineEventName, EngineWindow, WordEngineApi } from "./engine-types";
import { type EventTranslators, stateEvents } from "./events";
import { type EditorEvent, type EditorState, initialEditorState, reduceEditorState } from "./state";
import { createStore, type Store } from "./store";

export type DocumentUser = { id: string; name: string };

export type OpenWordOptions = {
  bytes: Uint8Array;
  title: string;
  user: DocumentUser;
  lang?: string;
  /** How long to wait until the document is shown, in milliseconds. */
  timeoutMs?: number;
};

export type WordEditor = {
  store: Store<EditorState>;
  commands: TextCommands;
  /** The document as .docx, written by the engine in the browser. */
  save: () => Promise<Uint8Array>;
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

const createDocInfo = (win: EngineWindow, options: OpenWordOptions) => {
  const user = new win.Asc.asc_CUserInfo();
  user.put_Id(options.user.id);
  user.put_FullName(options.user.name);

  const info = new win.Asc.asc_CDocInfo();
  info.put_Id(crypto.randomUUID());
  // The offline URL makes sdkjs skip the Document Server: no socket, a local license answer, and
  // the file comes from _openChartOrLocalDocument (common/apiBase.js asc_setDocInfo, _coAuthoringInit).
  info.put_Url(win.AscCommon.offlineMode);
  info.put_Title(options.title);
  info.put_Format("docx");
  info.put_UserInfo(user);
  info.put_Permissions({ edit: true, download: true, print: true, comment: true, review: true });
  info.put_Mode("edit");
  info.put_Lang(options.lang ?? "de");
  return info;
};

/**
 * Opens a .docx in the engine of an already mounted frame. The sequence follows the mobile editor
 * in Euro-Office/web-apps (apps/documenteditor/mobile/src/controller/Main.jsx): create the API, set
 * the document info, ask for permissions, load. In offline mode sdkjs asks for the file through
 * `_openChartOrLocalDocument`, which normally opens an empty document; here it gets our bytes.
 */
export const openWordDocument = (win: EngineWindow, options: OpenWordOptions): Promise<WordEditor> => {
  const store = createStore<EditorState>(initialEditorState);
  const dispatch = (event: EditorEvent) => store.set((state) => reduceEditorState(state, event));

  // The Euro-Office build carries the OOXML reader and writer (OpenDocumentFromZip, fromXml/toXml)
  // but only registers the "forms" addon, so the feature flag is set here. Without it the engine
  // expects the converter's binary format and fails to open a .docx (error -82).
  win.Asc.Addons = { ...win.Asc.Addons, ooxml: true };
  const api = new win.Asc.asc_docs_api({ "id-view": "editor_sdk", translate: {} });
  api.SetFontRenderingMode(fontRenderingMode(win.devicePixelRatio));
  api._openChartOrLocalDocument = () => api.asc_openDocumentFromBytes(options.bytes);
  subscribe(api, stateEvents(win.AscCommon), dispatch);

  const editor: WordEditor = {
    store,
    commands: createTextCommands(api, store.get, win.AscCommon),
    save: () =>
      new Promise<Uint8Array>((resolve, reject) => {
        api.saveLogicDocumentToZip(win.Asc.c_oAscFileType.DOCX, undefined, (data) =>
          data ? resolve(data) : reject(new Error("The engine could not write the document.")),
        );
      }),
    resize: () => api.Resize(),
    close: () => api.asc_CloseFile?.(),
  };

  return new Promise<WordEditor>((resolve, reject) => {
    const timer = setTimeout(() => {
      dispatch({ type: "error", message: "The document did not open in time." });
      reject(new Error("The document did not open in time."));
    }, options.timeoutMs ?? 60_000);

    api.asc_registerCallback("asc_onGetEditorPermissions", () => api.asc_LoadDocument());
    api.asc_registerCallback("asc_onDocumentContentReady", () => {
      clearTimeout(timer);
      api.Resize();
      api.zoomFitToWidth();
      dispatch({ type: "ready" });
      resolve(editor);
    });
    api.asc_registerCallback("asc_onError", (id, level) => {
      if (level !== CRITICAL_ERROR_LEVEL) return;
      clearTimeout(timer);
      const message = `The engine reported error ${id}.`;
      dispatch({ type: "error", message });
      reject(new Error(message));
    });

    api.asc_setDocInfo(createDocInfo(win, options));
    api.asc_getEditorPermissions();
  });
};
