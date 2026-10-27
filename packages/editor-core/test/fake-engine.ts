import type {
  EngineColor,
  EngineColorConstructor,
  EngineCommentData,
  SearchSettings,
  WordEngineApi,
  WordEventArgs,
  WordEventName,
  WordWindow,
} from "../src/engine-types";

type Callbacks = { [N in WordEventName]?: Array<(...args: WordEventArgs[N]) => void> };

export type FakeEngine = {
  window: WordWindow;
  api: () => FakeApi;
  /** Presses the mouse in the frame; returns how often the engine's input was focused so far. */
  press: () => number;
  /** How often the engine's input was focused so far. */
  focused: () => number;
  /** Makes the frame's fetch answer the URL with the bytes, as a server would. */
  serve: (url: string, bytes: Uint8Array) => void;
};

export type FakeApi = WordEngineApi & {
  calls: Array<[string, ...unknown[]]>;
  docInfo: Record<string, unknown>;
  emit: <N extends WordEventName>(name: N, ...args: WordEventArgs[N]) => void;
  nativeFile: string;
  modified: boolean;
  /** The numbering format at the cursor (c_oAscNumberingFormat), or null outside a list. */
  numbering: number | null;
};

/** Stands in for an asc_CColor: keeps r, g, b and Auto like common/apiCommon.js. */
export const fakeColor = (r = 0, g = 0, b = 0): EngineColor => {
  let auto = false;
  return {
    asc_getR: () => r,
    asc_getG: () => g,
    asc_getB: () => b,
    asc_getAuto: () => auto,
    asc_putAuto: (value: boolean) => {
      auto = value;
    },
  };
};

/** The asc_CColor constructor: called with `new`, it hands back the object fakeColor builds. */
export const FakeColor = function FakeColor(r?: number, g?: number, b?: number) {
  return fakeColor(r, g, b);
} as unknown as EngineColorConstructor;

/** Stands in for asc_CCommentDataWord: plain fields behind the getters and setters it has. */
export const fakeCommentData = (): EngineCommentData & { replies: EngineCommentData[] } => {
  const fields = {
    text: "",
    quote: null as string | null,
    time: "",
    ooTime: "",
    userId: "",
    userName: "",
    solved: false,
    guid: "",
  };
  const replies: EngineCommentData[] = [];
  return {
    replies,
    asc_getText: () => fields.text,
    asc_getQuoteText: () => fields.quote,
    asc_getTime: () => fields.time,
    asc_getOnlyOfficeTime: () => fields.ooTime,
    asc_getUserId: () => fields.userId,
    asc_getUserName: () => fields.userName,
    asc_getSolved: () => fields.solved,
    asc_getGuid: () => fields.guid,
    asc_getRepliesCount: () => replies.length,
    asc_getReply: (index) => replies[index] as EngineCommentData,
    asc_putText: (value) => {
      fields.text = value;
    },
    asc_putQuoteText: (value) => {
      fields.quote = value;
    },
    asc_putTime: (value) => {
      fields.time = value;
    },
    asc_putOnlyOfficeTime: (value) => {
      fields.ooTime = value;
    },
    asc_putUserId: (value) => {
      fields.userId = value;
    },
    asc_putUserName: (value) => {
      fields.userName = value;
    },
    asc_putSolved: (value) => {
      fields.solved = value;
    },
    asc_putGuid: (value) => {
      fields.guid = value;
    },
    asc_addReply: (reply) => {
      replies.push(reply);
    },
  };
};

const FakeCommentData = function FakeCommentData() {
  return fakeCommentData();
} as unknown as new (
  data: null,
) => EngineCommentData;

export const NUMBERING_FORMATS = { Bullet: 5, None: 48, Decimal: 13 };

const record =
  (calls: FakeApi["calls"], name: string) =>
  (...args: unknown[]) => {
    calls.push([name, ...args]);
  };

/** A stand-in for the engine frame's window with the same surface as engine-types.ts. */
/** common/api/searchSettings.js CSearchSettings, recording what was put. */
export type FakeSearchSettings = SearchSettings & { values: Record<string, unknown> };

export const FakeSearchSettings = function FakeSearchSettings(): FakeSearchSettings {
  const values: Record<string, unknown> = {};
  return {
    values,
    put_Text: (text) => {
      values.text = text;
    },
    put_MatchCase: (value) => {
      values.matchCase = value;
    },
    put_WholeWords: (value) => {
      values.wholeWords = value;
    },
  };
} as unknown as new () => SearchSettings;

export const createFakeEngine = (): FakeEngine => {
  let current: FakeApi | null = null;
  const events = new EventTarget();
  let focusCount = 0;
  const input = { focus: () => (focusCount += 1) } as unknown as HTMLElement;

  // A plain function, called with `new` by the code under test: returning an object from it gives
  // that object to the caller, just like the engine constructor returns its API.
  function FakeDocsApi(config: Record<string, unknown>): FakeApi {
    {
      const calls: FakeApi["calls"] = [["constructor", config]];
      const callbacks: Callbacks = {};
      const docInfo: Record<string, unknown> = {};
      let commentCount = 0;
      const api: FakeApi = {
        calls,
        docInfo,
        nativeFile: "DOCY;v5;4;AAAA",
        modified: false,
        numbering: null,
        AddImageUrl: (urls) => {
          calls.push(["AddImageUrl", urls]);
        },
        emit: (name, ...args) => {
          for (const callback of callbacks[name] ?? []) (callback as (...a: unknown[]) => void)(...args);
        },
        asc_registerCallback: (name, callback) => {
          const list = callbacks[name] ?? [];
          list.push(callback as never);
          callbacks[name] = list as never;
        },
        asc_setDocInfo: (info) => {
          Object.assign(docInfo, (info as unknown as { values: Record<string, unknown> }).values);
          calls.push(["asc_setDocInfo"]);
          // Like sdkjs in offline mode: the full API is loaded, so the local document is asked for.
          api._openChartOrLocalDocument();
        },
        asc_getEditorPermissions: () => {
          calls.push(["asc_getEditorPermissions"]);
          api.emit("asc_onGetEditorPermissions", {});
        },
        asc_LoadDocument: record(calls, "asc_LoadDocument"),
        callCommand: (code, isRecalculate, callback) => {
          calls.push(["callCommand", code, isRecalculate]);
          callback(undefined);
        },
        asc_openDocumentFromBytes: record(calls, "asc_openDocumentFromBytes"),
        _openChartOrLocalDocument: record(calls, "_openChartOrLocalDocument"),
        asc_nativeGetFile: () => {
          calls.push(["asc_nativeGetFile"]);
          return api.nativeFile;
        },
        SetFontRenderingMode: record(calls, "SetFontRenderingMode"),
        Resize: record(calls, "Resize"),
        zoomFitToWidth: record(calls, "zoomFitToWidth"),
        zoomFitToPage: record(calls, "zoomFitToPage"),
        zoomIn: record(calls, "zoomIn"),
        zoomOut: record(calls, "zoomOut"),
        zoom: record(calls, "zoom"),
        Copy: () => {
          calls.push(["Copy"]);
          return true;
        },
        Cut: () => {
          calls.push(["Cut"]);
          return true;
        },
        // Like a browser that refuses to read the clipboard without a key press.
        Paste: () => {
          calls.push(["Paste"]);
          return false;
        },
        put_TextPrBaseline: record(calls, "put_TextPrBaseline"),
        ClearFormating: record(calls, "ClearFormating"),
        put_AddPageBreak: record(calls, "put_AddPageBreak"),
        change_PageOrient: record(calls, "change_PageOrient"),
        change_DocSize: record(calls, "change_DocSize"),
        asc_SetSectionProps: record(calls, "asc_SetSectionProps"),
        put_PrLineSpacing: record(calls, "put_PrLineSpacing"),
        IncreaseIndent: record(calls, "IncreaseIndent"),
        getCurrentPage: () => 0,
        GoToHeader: record(calls, "GoToHeader"),
        GoToFooter: record(calls, "GoToFooter"),
        asc_RemoveHeader: record(calls, "asc_RemoveHeader"),
        asc_RemoveFooter: record(calls, "asc_RemoveFooter"),
        asc_CancelHdrFtrEditing: record(calls, "asc_CancelHdrFtrEditing"),
        put_PageNum: record(calls, "put_PageNum"),
        asc_GetTableOfContentsPr: () => null,
        asc_AddTableOfContents: record(calls, "asc_AddTableOfContents"),
        asc_UpdateTableOfContents: record(calls, "asc_UpdateTableOfContents"),
        asc_AddFootnote: record(calls, "asc_AddFootnote"),
        asc_AddEndnote: record(calls, "asc_AddEndnote"),
        put_AddColumnBreak: record(calls, "put_AddColumnBreak"),
        add_SectionBreak: record(calls, "add_SectionBreak"),
        AddShapeOnCurrentPage: record(calls, "AddShapeOnCurrentPage"),
        asc_AddPageCount: record(calls, "asc_AddPageCount"),
        asc_resetAllShortcutTypes: record(calls, "asc_resetAllShortcutTypes"),
        SetMarkerFormat: record(calls, "SetMarkerFormat"),
        SetPaintFormat: record(calls, "SetPaintFormat"),
        get_TextProps: () => ({ get_TextPr: () => ({ get_HighLight: () => ({ r: 255, g: 255, b: 0 }) }) }),
        can_AddHyperlink: () => "",
        getSelectedElements: () => [],
        add_Hyperlink: record(calls, "add_Hyperlink"),
        change_Hyperlink: record(calls, "change_Hyperlink"),
        remove_Hyperlink: record(calls, "remove_Hyperlink"),
        DecreaseIndent: record(calls, "DecreaseIndent"),
        asc_findText: (settings, isNext) => {
          calls.push(["asc_findText", (settings as unknown as FakeSearchSettings).values, isNext]);
          return 3;
        },
        asc_replaceText: (settings, replaceWith, isReplaceAll) => {
          calls.push([
            "asc_replaceText",
            (settings as unknown as FakeSearchSettings).values,
            replaceWith,
            isReplaceAll,
          ]);
          return true;
        },
        asc_endFindText: record(calls, "asc_endFindText"),
        WordControl: {
          m_oDrawingDocument: {
            ToRendererPart: (noBase64, isPrint) => {
              calls.push(["ToRendererPart", noBase64, isPrint]);
              return new Uint8Array([1, 2, 3]);
            },
          },
          m_oLogicDocument: {
            Get_MailMergedDocument: () => null,
            FieldsManager: { GetAllFieldsByType: () => [] },
            RecalculateAllAtOnce: record(calls, "RecalculateAllAtOnce"),
          },
          IsReaderMode: () => false,
        },
        ChangeReaderMode: record(calls, "ChangeReaderMode"),
        asc_SetViewRulers: record(calls, "asc_SetViewRulers"),
        asc_StartMailMergeByList: record(calls, "asc_StartMailMergeByList"),
        asc_GetReceptionsCount: () => 0,
        asc_AddMailMergeField: record(calls, "asc_AddMailMergeField"),
        asc_PreviewMailMergeResult: record(calls, "asc_PreviewMailMergeResult"),
        asc_EndPreviewMailMergeResult: record(calls, "asc_EndPreviewMailMergeResult"),
        asc_SetHighlightMailMergeFields: record(calls, "asc_SetHighlightMailMergeFields"),
        put_TextPrBold: record(calls, "put_TextPrBold"),
        put_TextPrItalic: record(calls, "put_TextPrItalic"),
        put_TextPrUnderline: record(calls, "put_TextPrUnderline"),
        put_TextPrFontSize: record(calls, "put_TextPrFontSize"),
        put_PrAlign: record(calls, "put_PrAlign"),
        put_TextPrStrikeout: record(calls, "put_TextPrStrikeout"),
        put_TextPrFontName: record(calls, "put_TextPrFontName"),
        put_TextColor: record(calls, "put_TextColor"),
        put_Style: record(calls, "put_Style"),
        put_ListTypeCustom: (preset) => {
          calls.push(["put_ListTypeCustom", preset]);
          const { Type: type } = JSON.parse(preset) as { Type: string };
          // Like the engine: the list is set after a promise, without asc_onFocusObject.
          return Promise.resolve().then(() => {
            api.numbering =
              type === "bullet"
                ? NUMBERING_FORMATS.Bullet
                : type === "number"
                  ? NUMBERING_FORMATS.Decimal
                  : null;
          });
        },
        // Like word/api.js: the engine reports added, changed and removed comments as events.
        asc_addComment: (data) => {
          calls.push(["asc_addComment", data]);
          commentCount += 1;
          const id = `comment-${commentCount}`;
          api.emit("asc_onAddComment", id, data);
          return id;
        },
        asc_changeComment: (id, data) => {
          calls.push(["asc_changeComment", id, data]);
          api.emit("asc_onChangeCommentData", id, data);
        },
        asc_removeComment: (id) => {
          calls.push(["asc_removeComment", id]);
          api.emit("asc_onRemoveComment", id);
        },
        asc_selectComment: record(calls, "asc_selectComment"),
        asc_showComments: record(calls, "asc_showComments"),
        put_Table: record(calls, "put_Table"),
        addRowAbove: record(calls, "addRowAbove"),
        addRowBelow: record(calls, "addRowBelow"),
        addColumnLeft: record(calls, "addColumnLeft"),
        addColumnRight: record(calls, "addColumnRight"),
        remRow: record(calls, "remRow"),
        remColumn: record(calls, "remColumn"),
        remTable: record(calls, "remTable"),
        asc_GetCurrentNumberingId: () => (api.numbering === null ? null : "1"),
        asc_GetCurrentNumberingLvl: () => 0,
        asc_GetNumberingPr: () => ({
          get_Lvl: () => ({ get_Format: () => api.numbering ?? NUMBERING_FORMATS.None }),
        }),
        asc_EditSelectAll: record(calls, "asc_EditSelectAll"),
        getFocusElement: () => input,
        isDocumentModified: () => api.modified,
        asc_setSpellCheck: record(calls, "asc_setSpellCheck"),
        asc_replaceMisspelledWord: record(calls, "asc_replaceMisspelledWord"),
        asc_ignoreMisspelledWord: record(calls, "asc_ignoreMisspelledWord"),
        asc_SetLocalTrackRevisions: record(calls, "asc_SetLocalTrackRevisions"),
        asc_SetGlobalTrackRevisions: record(calls, "asc_SetGlobalTrackRevisions"),
        asc_SetDisplayModeInReview: record(calls, "asc_SetDisplayModeInReview"),
        asc_GetNextRevisionsChange: record(calls, "asc_GetNextRevisionsChange"),
        asc_GetPrevRevisionsChange: record(calls, "asc_GetPrevRevisionsChange"),
        asc_AcceptChangesBySelection: record(calls, "asc_AcceptChangesBySelection"),
        asc_RejectChangesBySelection: record(calls, "asc_RejectChangesBySelection"),
        asc_AcceptAllChanges: record(calls, "asc_AcceptAllChanges"),
        asc_RejectAllChanges: record(calls, "asc_RejectAllChanges"),
        asc_SetFastCollaborative: record(calls, "asc_SetFastCollaborative"),
        SetCollaborativeMarksShowType: record(calls, "SetCollaborativeMarksShowType"),
        asc_setAutoSaveGap: record(calls, "asc_setAutoSaveGap"),
        asc_setViewMode: record(calls, "asc_setViewMode"),
        SetUnchangedDocument: () => {
          calls.push(["SetUnchangedDocument"]);
          api.modified = false;
          api.emit("asc_onDocumentModifiedChanged");
        },
        Undo: record(calls, "Undo"),
        Redo: record(calls, "Redo"),
        asc_CloseFile: record(calls, "asc_CloseFile"),
      };
      current = api;
      return api;
    }
  }

  /** Stands in for asc_CDocInfo and asc_CUserInfo: every `put_X(value)` is kept as `values.X`. */
  const valueHolder = () =>
    function ValueHolder() {
      const values: Record<string, unknown> = {};
      return new Proxy(
        { values },
        {
          get: (target, prop: string) =>
            prop === "values"
              ? target.values
              : (value: unknown) => {
                  values[prop.replace(/^put_/, "")] = value;
                },
        },
      );
    };

  // The frame's blob URLs and the engine's map of image paths to URLs (common/editorscommon.js).
  const blobs = new Map<string, Uint8Array>();
  const documentUrls: Record<string, string> = {};
  const window = {
    devicePixelRatio: 2,
    focus: () => {},
    URL: {
      createObjectURL: (blob: { bytes: Uint8Array }) => {
        const url = `blob:frame/${blobs.size}`;
        blobs.set(url, blob.bytes);
        return url;
      },
    },
    Blob: function FakeBlob(parts: Uint8Array[]) {
      return { bytes: parts[0] };
    },
    fetch: async (url: string) => ({
      arrayBuffer: async () => (blobs.get(url) ?? new Uint8Array(40)).slice().buffer,
    }),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    document: { hasFocus: () => false, activeElement: null, body: null, getElementById: () => null },
    Asc: {
      asc_docs_api: FakeDocsApi,
      asc_CDocInfo: valueHolder(),
      asc_CUserInfo: valueHolder(),
      asc_CColor: FakeColor,
      asc_CCommentDataWord: FakeCommentData,
      c_oAscNumberingFormat: NUMBERING_FORMATS,
      c_oAscTypeSelectElement: { Paragraph: 0, Table: 1, Header: 2, Hyperlink: 4, SpellCheck: 5 },
      c_oAscContextMenuTypes: { Common: 0, ChangeHdrFtr: 1 },
      c_oAscRevisionsChangeType: { TextAdd: 1, TextRem: 2, ParaAdd: 3, ParaRem: 4, TextPr: 5, ParaPr: 6 },
      c_oAscDisplayModeInReview: { Edit: 0, Final: 1, Original: 2 },
      c_oAscPageOrientation: { PagePortrait: 0 },
      linerule_Auto: 1,
      CDocumentSectionProps: function FakeSectionProps() {
        return {};
      },
      CTableOfContentsPr: function FakeTableOfContentsPr() {
        return {};
      },
      c_oAscSectionBreakType: { NextPage: 0, OddPage: 1, EvenPage: 2, Continuous: 3, Column: 4 },
      c_oAscTabLeader: { Dot: 0, None: 4 },
      c_oAscAsyncAction: { Disconnect: 20 },
      c_oAscCollaborativeMarksShowType: { All: 0, LastChanges: 1, None: 2 },
      c_oAscFileType: { DOCX: 0x41, XLSX: 0x101, PPTX: 0x81 },
    },
    AscCommon: {
      offlineMode: "_offline_",
      align_Right: 0,
      align_Left: 1,
      align_Center: 2,
      align_Justify: 3,
      vertalign_Baseline: 0,
      vertalign_SubScript: 1,
      vertalign_SuperScript: 2,
      CSearchSettings: FakeSearchSettings,
      g_oDocumentUrls: {
        getUrls: () => documentUrls,
        addUrls: (urls: Record<string, string>) => Object.assign(documentUrls, urls),
      },
      // Two fonts the document drew with, one it did not.
      g_font_loader: {
        fontFilesPath: "../../../../fonts/",
        fontFiles: [
          { Id: "000", Status: 0 },
          { Id: "001", Status: -1 },
          { Id: "002", Status: 1 },
        ],
      },
    },
  } as unknown as WordWindow;

  return {
    window,
    focused: () => focusCount,
    serve: (url, bytes) => {
      blobs.set(url, bytes);
    },
    press: () => {
      events.dispatchEvent(new Event("pointerdown"));
      return focusCount;
    },
    api: () => {
      if (!current) throw new Error("The API was not created yet.");
      return current;
    },
  };
};
