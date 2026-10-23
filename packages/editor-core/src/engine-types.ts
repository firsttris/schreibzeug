/**
 * The part of the sdkjs API that Stapel uses, typed by hand. sdkjs has no type definitions; every
 * member here is traceable to Euro-Office/sdkjs (file named per member). Only this package touches
 * these types; everything outside sees EditorState and the command functions.
 */

/** common/apiCommon.js `asc_CColor` */
export interface EngineColor {
  asc_getR(): number;
  asc_getG(): number;
  asc_getB(): number;
  asc_getAuto(): boolean;
  asc_putAuto(auto: boolean): void;
}

export type EngineColorConstructor = new (r?: number, g?: number, b?: number) => EngineColor;

/** common/commonDefines.js `c_oAscNumberingFormat`, the two values a list check needs. */
export type NumberingFormats = { Bullet: number; None: number };

/** Engine event names we subscribe to, with the arguments sdkjs passes (word/api.js `sendEvent`). */
export type EngineEventArgs = {
  asc_onBold: [isBold: boolean];
  asc_onItalic: [isItalic: boolean];
  asc_onUnderline: [isUnderline: boolean];
  asc_onStrikeout: [isStrikeout: boolean];
  /** word/api.js sync_TextColor */
  asc_onTextColor: [color: EngineColor];
  /** word/api.js sync_ParaStyleName */
  asc_onParaStyleName: [name: string];
  /** common/apiBase.js sync_InitEditorFonts: every font the engine can draw */
  asc_onInitEditorFonts: [fonts: Array<{ asc_getFontName(): string }>];
  /** word/api.js sync_InitEditorStyles: the paragraph styles of the document and the defaults */
  asc_onInitEditorStyles: [styles: { get_MergedStyles(): Array<{ get_Name(): string }> }];
  /** The selection moved to other objects (paragraph, table, image …). */
  asc_onFocusObject: [objects: unknown[]];
  asc_onFontSize: [size: number];
  asc_onFontFamily: [family: { asc_getName(): string | null }];
  asc_onPrAlign: [align: number];
  asc_onCanUndo: [canUndo: boolean];
  asc_onCanRedo: [canRedo: boolean];
  /** Sent without arguments (word/api.js SetDocumentModified); read `isDocumentModified()`. */
  asc_onDocumentModifiedChanged: [];
  asc_onCountPages: [pages: number];
  asc_onGetEditorPermissions: [permissions: unknown];
  asc_onDocumentContentReady: [];
  asc_onError: [id: number, level: number, data?: unknown];
};

export type EngineEventName = keyof EngineEventArgs;

/** common/apiCommon.js `asc_CUserInfo` */
export interface EngineUserInfo {
  put_Id(id: string): void;
  put_FullName(name: string): void;
}

/** common/apiCommon.js `asc_CDocInfo` */
export interface EngineDocInfo {
  put_Id(id: string): void;
  put_Url(url: string): void;
  put_Title(title: string): void;
  put_Format(format: string): void;
  put_UserInfo(user: EngineUserInfo): void;
  put_Permissions(permissions: Record<string, boolean>): void;
  put_Mode(mode: "edit" | "view"): void;
  put_Lang(lang: string): void;
}

/** word/api.js `asc_docs_api` (with common/apiBase.js `baseEditorsApi`) */
export interface WordEngineApi {
  asc_registerCallback<N extends EngineEventName>(
    name: N,
    callback: (...args: EngineEventArgs[N]) => void,
  ): void;
  asc_setDocInfo(info: EngineDocInfo): void;
  asc_getEditorPermissions(): void;
  asc_LoadDocument(): void;
  asc_openDocumentFromBytes(data: Uint8Array): void;
  /** apiBase.js: called by onEndLoadDocInfo in offline mode to open the local file. */
  _openChartOrLocalDocument(): void;
  /** word/api.js: the document in the engine's binary format, as "DOCY;v5;<size>;<base64>". */
  asc_nativeGetFile(): string;
  SetFontRenderingMode(mode: number): void;
  Resize(): void;
  zoomFitToWidth(): void;
  put_TextPrBold(value: boolean): void;
  put_TextPrItalic(value: boolean): void;
  put_TextPrUnderline(value: boolean): void;
  put_TextPrFontSize(size: number): void;
  put_TextPrStrikeout(value: boolean): void;
  put_TextPrFontName(name: string): void;
  put_TextColor(color: EngineColor): void;
  /** Applies a paragraph style by its name. */
  put_Style(name: string): void;
  /** A list from a preset object (see lists.ts); `{ Type: "remove" }` ends the list. */
  put_ListTypeCustom(value: object): void;
  asc_GetCurrentNumberingId(): string | null;
  asc_GetCurrentNumberingLvl(): number;
  asc_GetNumberingPr(id: string): { get_Lvl(level: number): { get_Format(): number } | null } | null;
  put_PrAlign(align: number): void;
  /** word/api.js */
  asc_EditSelectAll(): void;
  /** word/api.js: whether there are changes since opening or since `SetUnchangedDocument`. */
  isDocumentModified(): boolean;
  /** word/api.js: turns the red underlines of the spell checker on or off. */
  asc_setSpellCheck(isOn: boolean): void;
  /** word/api.js: marks the current state as saved and sends asc_onDocumentModifiedChanged. */
  SetUnchangedDocument(): void;
  Undo(): void;
  Redo(): void;
  asc_CloseFile?(): void;
}

/** The window of the engine frame after sdkjs has loaded (engine/frame/editor/word/main). */
export interface EngineWindow extends Window {
  Asc: {
    asc_docs_api: new (config: Record<string, unknown>) => WordEngineApi;
    asc_CDocInfo: new () => EngineDocInfo;
    asc_CUserInfo: new () => EngineUserInfo;
    asc_CColor: EngineColorConstructor;
    c_oAscNumberingFormat: NumberingFormats;
    /** common/commonDefines.js */
    c_oAscFileType: { DOCX: number; XLSX: number; PPTX: number };
  };
  AscCommon: {
    /** common/commonDefines.js `offlineMode`: a document URL that switches off the server connection. */
    offlineMode: string;
    align_Right: number;
    align_Left: number;
    align_Center: number;
    align_Justify: number;
  };
}
