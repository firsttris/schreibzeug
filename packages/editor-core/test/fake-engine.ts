import type {
  EngineColor,
  EngineColorConstructor,
  EngineEventArgs,
  EngineEventName,
  EngineWindow,
  WordEngineApi,
} from "../src/engine-types";

type Callbacks = { [N in EngineEventName]?: Array<(...args: EngineEventArgs[N]) => void> };

export type FakeEngine = {
  window: EngineWindow;
  api: () => FakeApi;
};

export type FakeApi = WordEngineApi & {
  calls: Array<[string, ...unknown[]]>;
  docInfo: Record<string, unknown>;
  emit: <N extends EngineEventName>(name: N, ...args: EngineEventArgs[N]) => void;
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

export const NUMBERING_FORMATS = { Bullet: 5, None: 48, Decimal: 13 };

const record =
  (calls: FakeApi["calls"], name: string) =>
  (...args: unknown[]) => {
    calls.push([name, ...args]);
  };

/** A stand-in for the engine frame's window with the same surface as engine-types.ts. */
export const createFakeEngine = (): FakeEngine => {
  let current: FakeApi | null = null;

  // A plain function, called with `new` by the code under test: returning an object from it gives
  // that object to the caller, just like the engine constructor returns its API.
  function FakeDocsApi(config: Record<string, unknown>): FakeApi {
    {
      const calls: FakeApi["calls"] = [["constructor", config]];
      const callbacks: Callbacks = {};
      const docInfo: Record<string, unknown> = {};
      const api: FakeApi = {
        calls,
        docInfo,
        nativeFile: "DOCY;v5;4;AAAA",
        modified: false,
        numbering: null,
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
        asc_openDocumentFromBytes: record(calls, "asc_openDocumentFromBytes"),
        _openChartOrLocalDocument: record(calls, "_openChartOrLocalDocument"),
        asc_nativeGetFile: () => {
          calls.push(["asc_nativeGetFile"]);
          return api.nativeFile;
        },
        SetFontRenderingMode: record(calls, "SetFontRenderingMode"),
        Resize: record(calls, "Resize"),
        zoomFitToWidth: record(calls, "zoomFitToWidth"),
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
        asc_GetCurrentNumberingId: () => (api.numbering === null ? null : "1"),
        asc_GetCurrentNumberingLvl: () => 0,
        asc_GetNumberingPr: () => ({
          get_Lvl: () => ({ get_Format: () => api.numbering ?? NUMBERING_FORMATS.None }),
        }),
        asc_EditSelectAll: record(calls, "asc_EditSelectAll"),
        isDocumentModified: () => api.modified,
        asc_setSpellCheck: record(calls, "asc_setSpellCheck"),
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

  const window = {
    devicePixelRatio: 2,
    Asc: {
      asc_docs_api: FakeDocsApi,
      asc_CDocInfo: valueHolder(),
      asc_CUserInfo: valueHolder(),
      asc_CColor: FakeColor,
      c_oAscNumberingFormat: NUMBERING_FORMATS,
      c_oAscFileType: { DOCX: 0x41, XLSX: 0x101, PPTX: 0x81 },
    },
    AscCommon: { offlineMode: "_offline_", align_Right: 0, align_Left: 1, align_Center: 2, align_Justify: 3 },
  } as unknown as EngineWindow;

  return {
    window,
    api: () => {
      if (!current) throw new Error("The API was not created yet.");
      return current;
    },
  };
};
