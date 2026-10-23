import type { EngineEventArgs, EngineEventName, EngineWindow, WordEngineApi } from "../src/engine-types";

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
};

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
        asc_EditSelectAll: record(calls, "asc_EditSelectAll"),
        isDocumentModified: () => api.modified,
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
