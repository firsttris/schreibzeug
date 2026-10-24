import type { CollabChannel } from "./collab";
import type {
  ApplyPdfChanges,
  Convert,
  Converted,
  FontFile,
  MediaFiles,
  OfficeFormat,
  RenderPdf,
  WritePdfA,
} from "./converter";
import { type CoreEvent, type CoreState, isCoreEvent, reduceCore } from "./core-state";
import { CSV_DELIMITER_CODES, type CsvDelimiter, detectDelimiter, encodeCsv } from "./csv";
import type { CommonEventArgs, DocumentUrls, EngineApiBase, EngineWindow } from "./engine-types";
import { coreEvents, type Translators } from "./events";
import { keepFocusOnClick } from "./frame";
import { createFrameSocketIO } from "./frame-socket";
import { addImage, collectMedia, type ImageStore, provideMedia } from "./media";
import { fontsForPdf } from "./print";
import { createStore, type Store } from "./store";
import { type AppShortcut, createListeners, shortcutOf } from "./view";

export type DocumentUser = { id: string; name: string };

export type OpenOptions = {
  /** The file: an Office file (.docx, .xlsx, .pptx) or a PDF. */
  bytes: Uint8Array;
  title: string;
  user: DocumentUser;
  /** Turns the file into the engine's binary format and back (converter.ts). */
  convert: Convert;
  /** Turns the engine's print commands into a PDF; without it the document has no PDF. */
  renderPdf?: RenderPdf;
  /** Writes the PDF editor's changes into the PDF (converter.ts); needed to save a PDF. */
  applyPdfChanges?: ApplyPdfChanges;
  /** Draws a PDF anew as PDF/A (converter.ts); a PDF has no PDF/A without it. */
  writePdfA?: WritePdfA;
  lang?: string;
  /** The file is a CSV, not an .xlsx: it is read and saved as one (csv.ts). Spreadsheets only. */
  csv?: boolean;
  /** Red underlines for misspelled words (spelling.ts); on unless switched off. */
  spellCheck?: boolean;
  /** "view" opens the document read-only: for someone it is shared with to look at. */
  mode?: "edit" | "view";
  /** How long to wait until the document is shown, in milliseconds. */
  timeoutMs?: number;
  /**
   * Edit together with others: the relay session (collab.ts joinSession) and the id every
   * participant uses for this document. `bytes` must be the session's base version.
   */
  collaboration?: { channel: CollabChannel; documentId: string };
  /** Where inserted images are kept; without it the document offers no insertImage. */
  images?: ImageStore;
};

/** An Office file made from the document, and how many of the session's changes it holds. */
export type SavedDocument = { bytes: Uint8Array; seen: number };

/** What every open document offers, whatever the editor. */
export type OpenedDocument<S extends CoreState> = {
  store: Store<S>;
  /** The document as an Office file: the engine's binary, converted in the browser. */
  save: () => Promise<SavedDocument>;
  /**
   * The copy from `save` is stored: "modified" turns false until the next change, and in a shared
   * session everyone learns how much of the change log the stored version holds.
   */
  markSaved: (saved: SavedDocument) => void;
  resize: () => void;
  close: () => void;
  /**
   * The document in another format, e.g. a spreadsheet as CSV (the active sheet's values, with ";"
   * as German Excel writes them).
   */
  exportAs: (format: "csv") => Promise<Uint8Array>;
  /**
   * The document as a PDF, as it would print, or as PDF/A for archiving; null where the editor
   * cannot make one.
   */
  exportPdf: ((pdfa?: boolean) => Promise<Uint8Array>) | null;
  /**
   * Strg+F, Strg+H or Strg+P in the document. The engine leaves them to its UI (web-apps opens its
   * search panel or print preview); here they go to the listener instead of the browser.
   */
  onShortcut: (listener: (shortcut: AppShortcut) => void) => () => void;
  /** Puts an image (PNG, JPEG, GIF, BMP) in at the cursor; null without an image store. */
  insertImage: ((bytes: Uint8Array) => Promise<void>) | null;
};

/** The formats the editors open: the Office formats and PDF. */
export type DocumentFormat = OfficeFormat | "pdf";

/** The format of the file itself: the editor's, or a CSV with its delimiter (csv.ts). */
type FileFormat = { format: DocumentFormat } | { format: "csv"; delimiter: CsvDelimiter };

/**
 * The file in the engine's format. x2t reads a CSV into an .xlsx only (to the engine's binary it
 * stops with error 89), so a CSV takes that step first. A PDF needs none: the PDF editor reads the
 * file itself (pdf/api.js openDocument → DocumentRenderer.open).
 */
const toBinary = async (
  options: Pick<OpenOptions, "bytes" | "convert">,
  file: FileFormat,
): Promise<Converted> => {
  if (file.format === "pdf") return { bytes: options.bytes, media: {} };
  if (file.format !== "csv") return options.convert(options.bytes, file.format, "bin");
  const delimiter = CSV_DELIMITER_CODES[file.delimiter];
  const workbook = await options.convert(options.bytes, "csv", "xlsx", undefined, delimiter);
  return options.convert(workbook.bytes, "xlsx", "bin");
};

/** The sheet as a CSV file, written here rather than by x2t (csv.ts says why). */
const csvOf = <Api>(api: Api, sheetText: ((api: Api) => string[][]) | undefined, delimiter: CsvDelimiter) => {
  if (!sheetText) throw new Error("Only a spreadsheet can be saved as CSV.");
  return encodeCsv(sheetText(api), delimiter);
};

/** What one editor's engine needs on top of the shared opening flow. */
export type EditorBinding<
  W extends EngineWindow,
  Events extends CommonEventArgs,
  Api extends EngineApiBase<Events>,
  S extends CoreState,
  E extends { type: string },
  Parts,
> = {
  /** The format of the files this editor opens. */
  format: DocumentFormat;
  /** The editor's API object, created in the frame (word/api.js, cell/api.js, slide/api.js). */
  createApi: (win: W) => Api;
  initialState: S;
  /** The editor's own events; the shared ones go through reduceCore. */
  reduce: (state: S, event: E) => S;
  /** Engine events that become the editor's own events. */
  events: (win: W) => Translators<Events, E | CoreEvent>;
  /** Callbacks and commands of this editor: its part of the opened document. */
  setup: (context: KindContext<W, Api, S, E>) => Parts;
  /** What the editor sets once the document is shown (spell check, zoom, …). */
  contentReady: (api: Api, win: W, opened: { shared: boolean; spellCheck: boolean }) => void;
  resize: (api: Api) => void;
  /** Marks the current state as saved in the engine, where the editor can. */
  markUnchanged: (api: Api) => void;
  /** Every page as drawing commands for a PDF, where the editor can (print.ts). */
  printCommands?: (api: Api) => Uint8Array;
  /** The values the sheet shows, row by row, for a CSV file; spreadsheets only (cell.ts). */
  sheetText?: (api: Api) => string[][];
  /**
   * Saves the file in its own way, where it is no Office file: a PDF writes the editor's changes
   * into the original (pdf.ts). Without it the binary goes back through x2t.
   */
  saveFile?: (api: Api, options: OpenOptions, media: () => Promise<MediaFiles>) => Promise<Uint8Array>;
  /** The file as PDF/A with these fonts, where it is a PDF itself (pdf.ts). */
  pdfA?: (api: Api, options: OpenOptions, fonts: FontFile[], media: MediaFiles) => Promise<Uint8Array>;
};

export type KindContext<W, Api, S, E> = {
  win: W;
  api: Api;
  store: Store<S>;
  dispatch: (event: E | CoreEvent) => void;
  options: OpenOptions;
};

/** common/errorCodes.js `c_oAscError.Level.Critical`: the document cannot be used. */
const CRITICAL_ERROR_LEVEL = -1;

const subscribe = <Events extends CommonEventArgs, Out>(
  api: EngineApiBase<Events>,
  translators: Translators<Events, Out>,
  dispatch: (event: Out) => void,
): void => {
  for (const name of Object.keys(translators) as Array<keyof Events>) {
    const translate = translators[name] as (...args: unknown[]) => Out | null;
    api.asc_registerCallback(name, (...args) => {
      const event = translate(...args);
      if (event) dispatch(event);
    });
  }
};

const createDocInfo = (win: EngineWindow, options: OpenOptions, format: DocumentFormat, url: string) => {
  const user = new win.Asc.asc_CUserInfo();
  user.put_Id(options.user.id);
  user.put_FullName(options.user.name);

  const info = new win.Asc.asc_CDocInfo();
  info.put_Id(options.collaboration?.documentId ?? crypto.randomUUID());
  info.put_Url(url);
  info.put_Title(options.title);
  info.put_Format(format);
  info.put_UserInfo(user);
  const edit = options.mode !== "view";
  info.put_Permissions({ edit, download: true, print: true, comment: edit, review: edit });
  info.put_Mode(edit ? "edit" : "view");
  info.put_Lang(options.lang ?? "de");
  // Fast co-editing, as web-apps chooses by default (documenteditor/mobile Main.jsx coEditMode).
  if (options.collaboration) info.put_CoEditingMode("fast");
  return info;
};

/** Reads a URL of the frame (a blob of an image, a font file) with the frame's own fetch. */
const fetchBytes = (win: EngineWindow) => async (url: string) => (await win.fetch(url)).arrayBuffer();

/**
 * The document as a PDF: the editor's print commands with the fonts it drew with, turned into a
 * PDF by x2t. The fonts come from the frame's own font folder, which the browser has cached.
 */
const pdfExport = <Api extends { asc_nativeGetFile(): string }>(
  win: EngineWindow,
  api: Api,
  printCommands: ((api: Api) => Uint8Array) | undefined,
  renderPdf: RenderPdf | undefined,
  snapshot: () => Promise<Snapshot>,
): OpenedDocument<CoreState>["exportPdf"] => {
  if (!printCommands || !renderPdf) return null;
  return async (pdfa = false) => {
    const { binary, media } = await snapshot();
    const commands = printCommands(api);
    return renderPdf(binary, commands, await engineFonts(win), media, pdfa);
  };
};

/** The fonts the engine has drawn with, as x2t embeds them (print.ts). */
const engineFonts = (win: EngineWindow) =>
  fontsForPdf(win.AscCommon.g_font_loader, win.location.href, fetchBytes(win));

/**
 * A PDF's own export: the PDF as saved, or drawn anew as PDF/A with the fonts the engine drew it
 * with (pdf.ts pdfA).
 */
const fileExport =
  <Api>(
    api: Api,
    options: OpenOptions,
    win: EngineWindow,
    media: () => Promise<MediaFiles>,
    saveFile: (api: Api, options: OpenOptions, media: () => Promise<MediaFiles>) => Promise<Uint8Array>,
    pdfA:
      | ((api: Api, options: OpenOptions, fonts: FontFile[], media: MediaFiles) => Promise<Uint8Array>)
      | undefined,
  ): NonNullable<OpenedDocument<CoreState>["exportPdf"]> =>
  async (pdfa = false) => {
    if (!pdfa) return saveFile(api, options, media);
    if (!pdfA) throw new Error("This editor makes no PDF/A of a PDF.");
    return pdfA(api, options, await engineFonts(win), await media());
  };

/** The document in the engine's binary format and the images it refers to. */
type Snapshot = { binary: Uint8Array; media: MediaFiles };

/**
 * An image from the user's computer, put in at the cursor: stored first, so that everyone in the
 * session can load it from its URL, then handed to the engine like an uploaded one
 * (common/apiBase.js _uploadCallback → _addImageUrl).
 */
const insertImage = (
  urls: DocumentUrls,
  api: EngineApiBase<CommonEventArgs>,
  images: ImageStore | undefined,
): OpenedDocument<CoreState>["insertImage"] =>
  images
    ? async (bytes) => {
        const { name, url } = await images.upload(bytes);
        addImage(urls, name, url);
        api.AddImageUrl([url]);
      }
    : null;

/** Feeds the relay's messages into the session progress (session-progress.ts). */
const followProgress = (channel: CollabChannel | undefined, dispatch: (event: CoreEvent) => void) =>
  channel?.observe((json) => dispatch({ type: "message", json })) ?? (() => {});

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
  api: EngineApiBase<CommonEventArgs>,
  binary: Uint8Array,
  collaboration: OpenOptions["collaboration"],
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
 * collaboration/Collaboration.jsx onDocumentReady): changes go out as they happen, every second.
 * Without the autosave gap the engine sends nothing.
 */
const startCoEditing = (api: EngineApiBase<CommonEventArgs>): void => {
  api.asc_SetFastCollaborative(true);
  api.asc_setAutoSaveGap(1);
};

/**
 * Opens an Office file in the engine of an already mounted frame. The engine of this build reads
 * only its binary format — its OOXML readers are not part of Euro-Office — so the file is converted
 * with x2t first, and saving converts back. The sequence follows the mobile editors of web-apps
 * (apps/*editor/mobile/src/controller/Main.jsx): create the API, set the document info, ask for
 * permissions, load.
 */
export const openDocument = <
  W extends EngineWindow,
  Events extends CommonEventArgs,
  Api extends EngineApiBase<Events>,
  S extends CoreState,
  E extends { type: string },
  Parts,
>(
  win: W,
  options: OpenOptions,
  binding: EditorBinding<W, Events, Api, S, E, Parts>,
): Promise<OpenedDocument<S> & Parts> => {
  const store = createStore<S>(binding.initialState);
  const file: FileFormat = options.csv
    ? { format: "csv", delimiter: detectDelimiter(options.bytes) }
    : { format: binding.format };
  const dispatch = (event: E | CoreEvent) =>
    store.set((state) => (isCoreEvent(event) ? reduceCore(state, event) : binding.reduce(state, event as E)));

  return new Promise((resolve, reject) => {
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
    const timer = setTimeout(
      () => onFailure("The document did not open in time."),
      options.timeoutMs ?? 60_000,
    );

    const start = ({ bytes: binary, media }: Converted) => {
      const api = binding.createApi(win);
      const urls = win.AscCommon.g_oDocumentUrls;
      provideMedia(urls, media, (image) => win.URL.createObjectURL(new win.Blob([image as BlobPart])));
      // The document with the images it holds: those it came with and those added since, by
      // anyone (others' images arrive by name, and the relay says where they are; collab.ts).
      const documentMedia = () => collectMedia(urls, fetchBytes(win));
      const snapshot = async (): Promise<Snapshot> => {
        const binary = new TextEncoder().encode(api.asc_nativeGetFile());
        return { binary, media: await documentMedia() };
      };
      const base = api as unknown as EngineApiBase<CommonEventArgs>;
      const stopProgress = followProgress(options.collaboration?.channel, dispatch);
      const url = connectEngine(win, base, binary, options.collaboration);
      subscribe(base, coreEvents(win.Asc.c_oAscAsyncAction.Disconnect), dispatch);
      subscribe(api, binding.events(win), dispatch);
      keepFocusOnClick(win, () => api.getFocusElement());
      const shortcuts = createListeners<AppShortcut>();
      const onKey = (event: KeyboardEvent) => {
        const shortcut = shortcutOf(event);
        if (!shortcut) return;
        event.preventDefault();
        event.stopPropagation();
        shortcuts.emit(shortcut);
      };
      win.addEventListener("keydown", onKey, true);
      // The event carries no value in word and slide; web-apps reads the flag on it.
      base.asc_registerCallback("asc_onDocumentModifiedChanged", () =>
        dispatch({ type: "modified", value: api.isDocumentModified() }),
      );
      const parts = binding.setup({ win, api, store, dispatch, options });
      const { saveFile } = binding;

      const opened: OpenedDocument<S> & Parts = {
        ...parts,
        store,
        save: async () => {
          const seen = store.get().session.seen;
          if (file.format === "csv") return { bytes: csvOf(api, binding.sheetText, file.delimiter), seen };
          if (saveFile) return { bytes: await saveFile(api, options, documentMedia), seen };
          if (file.format === "pdf") throw new Error("A PDF editor saves through saveFile.");
          const { binary: binaryNow, media: mediaNow } = await snapshot();
          const saved = await options.convert(binaryNow, "bin", file.format, mediaNow);
          return { bytes: saved.bytes, seen };
        },
        exportAs: async () => csvOf(api, binding.sheetText, "semicolon"),
        markSaved: ({ seen }) => {
          binding.markUnchanged(api);
          options.collaboration?.channel.send(JSON.stringify({ type: "schreibzeug:saved", index: seen }));
        },
        resize: () => binding.resize(api),
        onShortcut: shortcuts.add,
        // A PDF is its own PDF: exporting it is saving it, or drawing it anew as PDF/A.
        exportPdf:
          saveFile && file.format === "pdf"
            ? fileExport(api, options, win, documentMedia, saveFile, binding.pdfA)
            : pdfExport(win, api, binding.printCommands, options.renderPdf, snapshot),
        insertImage: insertImage(urls, base, options.images),
        close: () => {
          win.removeEventListener("keydown", onKey, true);
          stopProgress();
          api.asc_CloseFile?.();
        },
      };

      base.asc_registerCallback("asc_onGetEditorPermissions", () => {
        // web-apps applyMode (documenteditor/mobile Main.jsx): a viewer's engine refuses every
        // change. Shared, it still follows the others' changes: in view mode with fast co-editing
        // the engine is a live viewer (common/apiBase.js isLiveViewer).
        if (options.mode === "view") base.asc_setViewMode(true);
        api.asc_LoadDocument();
      });
      base.asc_registerCallback("asc_onDocumentContentReady", () => {
        if (options.collaboration) startCoEditing(base);
        binding.contentReady(api, win, {
          shared: Boolean(options.collaboration),
          spellCheck: options.spellCheck !== false && options.mode !== "view",
        });
        settle(() => {
          dispatch({ type: "ready" });
          resolve(opened);
        });
      });
      base.asc_registerCallback("asc_onError", (id, level) => {
        if (level === CRITICAL_ERROR_LEVEL) onFailure(`The engine reported error ${id}.`);
      });

      api.asc_setDocInfo(createDocInfo(win, options, binding.format, url));
      api.asc_getEditorPermissions();
    };

    toBinary(options, file)
      .then(start)
      .catch((error: unknown) => onFailure(error instanceof Error ? error.message : String(error)));
  });
};
