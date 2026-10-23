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

/** word/api.js `asc_CCommentDataWord`: a comment or a reply. */
export interface EngineCommentData {
  asc_getText(): string;
  asc_getQuoteText(): string | null;
  asc_getTime(): string;
  asc_getOnlyOfficeTime(): string;
  asc_getUserId(): string;
  asc_getUserName(): string;
  asc_getSolved(): boolean;
  asc_getGuid(): string;
  asc_getRepliesCount(): number;
  asc_getReply(index: number): EngineCommentData;
  asc_putText(text: string): void;
  asc_putQuoteText(text: string): void;
  asc_putTime(time: string): void;
  asc_putOnlyOfficeTime(time: string): void;
  asc_putUserId(id: string): void;
  asc_putUserName(name: string): void;
  asc_putSolved(solved: boolean): void;
  asc_putGuid(guid: string): void;
  asc_addReply(reply: EngineCommentData): void;
}

/**
 * Events every editor sends (common/apiBase.js `sendEvent`), with their arguments.
 */
export type CommonEventArgs = {
  /** common/apiBase.js sync_InitEditorFonts: every font the engine can draw */
  asc_onInitEditorFonts: [fonts: Array<{ asc_getFontName(): string }>];
  /** Sent without arguments by word and slide (SetDocumentModified); read `isDocumentModified()`. */
  asc_onDocumentModifiedChanged: [];
  asc_onGetEditorPermissions: [permissions: unknown];
  asc_onDocumentContentReady: [];
  asc_onError: [id: number, level: number, data?: unknown];
  /** common/apiBase.js sync_StartAction / sync_EndAction: c_oAscAsyncActionType, c_oAscAsyncAction. */
  asc_onStartAction: [type: number, id: number];
  asc_onEndAction: [type: number, id: number];
};

/**
 * Character formatting events, the same in the text and the presentation editor (word/api.js,
 * slide/api.js `sendEvent`).
 */
export type TextEventArgs = CommonEventArgs & {
  asc_onBold: [isBold: boolean];
  asc_onItalic: [isItalic: boolean];
  asc_onUnderline: [isUnderline: boolean];
  asc_onStrikeout: [isStrikeout: boolean];
  /** sync_TextColor */
  asc_onTextColor: [color: EngineColor];
  asc_onFontSize: [size: number];
  asc_onFontFamily: [family: { asc_getName(): string | null }];
  asc_onPrAlign: [align: number];
  asc_onCanUndo: [canUndo: boolean];
  asc_onCanRedo: [canRedo: boolean];
  asc_onCountPages: [pages: number];
};

/** Events of the text editor we subscribe to, with the arguments sdkjs passes (word/api.js `sendEvent`). */
export type WordEventArgs = TextEventArgs & {
  /** word/api.js sync_ParaStyleName */
  asc_onParaStyleName: [name: string];
  /** word/api.js sync_InitEditorStyles: the paragraph styles of the document and the defaults */
  asc_onInitEditorStyles: [styles: { get_MergedStyles(): Array<{ get_Name(): string }> }];
  /** The selection moved to other objects (paragraph, table, image …): common/apiCommon.js asc_CSelectedObject. */
  asc_onFocusObject: [objects: Array<{ asc_getObjectType(): number }>];
  /** word/api.js sync_AddComment: on open for each comment in the file, and for each new one. */
  asc_onAddComment: [id: string, data: EngineCommentData];
  asc_onChangeCommentData: [id: string, data: EngineCommentData];
  asc_onRemoveComment: [id: string];
  /** The cursor is on commented text (word/api.js sync_ShowComment). */
  asc_onShowComment: [ids: string[], x?: number, y?: number];
  asc_onHideComment: [];
};

export type WordEventName = keyof WordEventArgs;

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
  /** "fast": changes go out as they happen; "strict": only when the user saves. */
  put_CoEditingMode(mode: "fast" | "strict"): void;
}

/** What every editor's API offers (common/apiBase.js `baseEditorsApi`), typed by its events. */
export interface EngineApiBase<Events extends CommonEventArgs> {
  asc_registerCallback<N extends keyof Events>(
    name: N,
    callback: (...args: Extract<Events[N], unknown[]>) => void,
  ): void;
  asc_setDocInfo(info: EngineDocInfo): void;
  asc_getEditorPermissions(): void;
  asc_LoadDocument(): void;
  asc_openDocumentFromBytes(data: Uint8Array): void;
  /** apiBase.js: called by onEndLoadDocInfo in offline mode to open the local file. */
  _openChartOrLocalDocument(): void;
  /**
   * The document in the engine's binary format, which x2t reads: "DOCY;…" (word/api.js),
   * "XLSY;…" (cell/api.js), "PPTY;…" (slide/api.js).
   */
  asc_nativeGetFile(): string;
  /** common/apiBase.js: the hidden input that takes the keys (g_inputContext.HtmlArea). */
  getFocusElement(): HTMLElement;
  /** Whether there are changes not yet saved or, in co-editing, not yet sent. */
  isDocumentModified(): boolean;
  /** Send changes as they happen, instead of when the user saves. */
  asc_SetFastCollaborative(isOn: boolean): void;
  /** common/apiBase.js: seconds between sends of the changes; 0 sends none. */
  asc_setAutoSaveGap(seconds: number): void;
  asc_CloseFile?(): void;
}

/** Character formatting, named the same in the text and the presentation editor. */
export interface CharacterApi {
  put_TextPrBold(value: boolean): void;
  put_TextPrItalic(value: boolean): void;
  put_TextPrUnderline(value: boolean): void;
  put_TextPrStrikeout(value: boolean): void;
  put_TextPrFontSize(size: number): void;
  put_TextPrFontName(name: string): void;
  put_TextColor(color: EngineColor): void;
  put_PrAlign(align: number): void;
  asc_EditSelectAll(): void;
  Undo(): void;
  Redo(): void;
}

/** word/api.js `asc_docs_api` (with common/apiBase.js `baseEditorsApi`) */
export interface WordEngineApi extends EngineApiBase<WordEventArgs>, CharacterApi {
  SetFontRenderingMode(mode: number): void;
  Resize(): void;
  zoomFitToWidth(): void;
  /** Applies a paragraph style by its name. */
  put_Style(name: string): void;
  /**
   * A list from a preset in JSON (see lists.ts); `{"Type":"remove"}` ends the list. Asynchronous:
   * it first loads the font of the bullet, then applies the list (returns undefined for a bad preset).
   */
  put_ListTypeCustom(value: string): Promise<unknown> | undefined;
  /** word/api.js: a table of `columns` × `rows` at the cursor, in the default table style. */
  put_Table(columns: number, rows: number): void;
  addRowAbove(): void;
  addRowBelow(): void;
  addColumnLeft(): void;
  addColumnRight(): void;
  remRow(): void;
  remColumn(): void;
  remTable(): void;
  /** word/api.js: returns the new comment's id, or null when it could not be added. */
  asc_addComment(data: EngineCommentData): string | null;
  asc_changeComment(id: string, data: EngineCommentData): void;
  asc_removeComment(id: string): void;
  asc_selectComment(id: string): void;
  /** Marks commented text in the document; `showResolved` includes resolved comments. */
  asc_showComments(showResolved: boolean): void;
  asc_GetCurrentNumberingId(): string | null;
  asc_GetCurrentNumberingLvl(): number;
  asc_GetNumberingPr(id: string): { get_Lvl(level: number): { get_Format(): number } | null } | null;
  /** word/api.js: how others' changes are marked (common/commonDefines.js c_oAscCollaborativeMarksShowType). */
  SetCollaborativeMarksShowType(type: number): void;
  /** word/api.js: turns the red underlines of the spell checker on or off. */
  asc_setSpellCheck(isOn: boolean): void;
  /** word/api.js: marks the current state as saved and sends asc_onDocumentModifiedChanged. */
  SetUnchangedDocument(): void;
}

/** The window of an engine frame after sdkjs has loaded (engine/frame/editor/<kind>/main). */
export interface EngineWindow extends Window {
  /** The socket.io client sdkjs connects with, if set (common/editorscommon.js getSocketIO). */
  io?: unknown;
  /** The frame's own globals: objects made with them belong to the engine's realm. */
  JSON: JSON;
  URL: typeof URL;
  Blob: typeof Blob;
  Asc: {
    asc_CDocInfo: new () => EngineDocInfo;
    asc_CUserInfo: new () => EngineUserInfo;
    asc_CColor: EngineColorConstructor;
    /** common/commonDefines.js */
    c_oAscAsyncAction: { Disconnect: number };
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

/** The text editor's frame (engine/frame/editor/word/main). */
export interface WordWindow extends EngineWindow {
  Asc: EngineWindow["Asc"] & {
    asc_docs_api: new (config: Record<string, unknown>) => WordEngineApi;
    asc_CCommentDataWord: new (data: null) => EngineCommentData;
    c_oAscNumberingFormat: NumberingFormats;
    /** common/commonDefines.js */
    c_oAscCollaborativeMarksShowType: { None: number };
    /** common/commonDefines.js: what a selected object is. */
    c_oAscTypeSelectElement: { Table: number };
  };
}

/** cell/model/WorkbookElems.js `CellXfs`: the formatting of the active cell. */
export interface EngineCellXfs {
  asc_getFontName(): string;
  asc_getFontSize(): number;
  asc_getFontColor(): EngineColor | null;
  asc_getFontBold(): boolean;
  asc_getFontItalic(): boolean;
  asc_getFontUnderline(): boolean;
  asc_getFontStrikeout(): boolean;
  asc_getFillColor(): EngineColor | null;
  asc_getHorAlign(): number;
  asc_getWrapText(): boolean;
  /** The number format code, e.g. "General" or "0.00%". */
  asc_getNumFormat(): string;
}

/** cell/model/CellInfo.js `asc_CCellInfo`: what asc_onSelectionChanged reports. */
export interface EngineCellInfo {
  asc_getXfs(): EngineCellXfs;
  /** cell/apiDefines.js c_oAscMergeOptions: None, Merge, … for the selection. */
  asc_getMerge(): number;
}

/** Events of the spreadsheet editor we subscribe to (cell/api.js `handlers.trigger`). */
export type CellEventArgs = CommonEventArgs & {
  asc_onSelectionChanged: [info: EngineCellInfo];
  /** The reference of the selection, e.g. "A1" or "B2:C4" (a string, or an object with asc_getName). */
  asc_onSelectionNameChanged: [name: string | { asc_getName(): string }];
  asc_onSheetsChanged: [];
  asc_onActiveSheetChanged: [index: number];
  asc_onCanUndoChanged: [canUndo: boolean];
  asc_onCanRedoChanged: [canRedo: boolean];
};

/** cell/api.js `spreadsheet_api` (with common/apiBase.js `baseEditorsApi`). */
export interface CellEngineApi extends EngineApiBase<CellEventArgs> {
  asc_setFontRenderingMode(mode: number): void;
  /** cell/api.js: the regional format (LCID), e.g. 0x0407 for German: decimal comma, ";" between arguments. */
  asc_setLocale(lcid: number): void;
  asc_Resize(): void;
  asc_Undo(): void;
  asc_Redo(): void;
  asc_getCellInfo(): EngineCellInfo;
  asc_setCellBold(value: boolean): void;
  asc_setCellItalic(value: boolean): void;
  asc_setCellUnderline(value: boolean): void;
  asc_setCellStrikeout(value: boolean): void;
  asc_setCellFontName(name: string): void;
  asc_setCellFontSize(size: number): void;
  asc_setCellTextColor(color: EngineColor): void;
  /** null takes the fill away. */
  asc_setCellBackgroundColor(color: EngineColor | null): void;
  asc_setCellAlign(align: number): void;
  asc_setCellTextWrap(wrap: boolean): void;
  /** A number format code, e.g. "0.00%". */
  asc_setCellFormat(format: string): void;
  /** cell/apiDefines.js c_oAscMergeOptions */
  asc_mergeCells(option: number): void;
  /** common/commonDefines.js c_oAscInsertOptions */
  asc_insertCells(option: number): void;
  /** common/commonDefines.js c_oAscDeleteOptions */
  asc_deleteCells(option: number): void;
  asc_getWorksheetsCount(): number;
  asc_getWorksheetName(index: number): string;
  asc_isWorksheetHidden(index: number): boolean;
  asc_getActiveWorksheetIndex(): number;
  asc_showWorksheet(index: number): void;
  asc_addWorksheet(name: string): void;
  asc_renameWorksheet(name: string): boolean;
  /** Deletes the active sheet; false when it cannot (the last visible one). */
  asc_deleteWorksheet(): boolean;
  /** Moves the selection to a reference, e.g. "C7" or "Tabelle2!A1". */
  asc_findCell(reference: string): void;
  /** Leaves the cell being typed into; `cancel` drops what was typed. */
  asc_closeCellEditor(cancel?: boolean): void;
}

/** The spreadsheet editor's frame (engine/frame/editor/cell/main). */
export interface CellWindow extends EngineWindow {
  Asc: EngineWindow["Asc"] & {
    spreadsheet_api: new (config: Record<string, unknown>) => CellEngineApi;
    c_oAscMergeOptions: { Disabled: number; None: number; Merge: number; MergeCenter: number };
    c_oAscInsertOptions: { InsertColumns: number; InsertRows: number };
    c_oAscDeleteOptions: { DeleteColumns: number; DeleteRows: number };
  };
}

/** slide/apiCommon.js `CLayoutThumbnail`: a layout of the master, as asc_onUpdateLayout lists it. */
export interface EngineLayout {
  getIndex(): number;
  get_Name(): string;
  /** A picture of the layout as a data URL. */
  get_Image(): string;
}

/** Events of the presentation editor we subscribe to (slide/api.js `sendEvent`). */
export type SlideEventArgs = TextEventArgs & {
  /** The slide shown, from 0. */
  asc_onCurrentPage: [index: number];
  /** slide/Drawing/HtmlPage.js: the layouts of the current master. */
  asc_onUpdateLayout: [layouts: EngineLayout[]];
  /** The list at the cursor: type 0 bullets, 1 numbering, -1 none (slide/api.js sync_ListType). */
  asc_onListType: [list: { get_ListType(): number; get_ListSubType(): number }];
};

/** slide/api.js `asc_docs_api` (with common/apiBase.js `baseEditorsApi`). */
export interface SlideEngineApi extends EngineApiBase<SlideEventArgs>, CharacterApi {
  SetFontRenderingMode(mode: number): void;
  /** Holds back drawing while the document opens (web-apps presentationeditor/mobile Main.jsx). */
  SetDrawingFreeze(freeze: boolean): void;
  /** Where the engine finds its built-in themes. */
  SetThemesPath(path: string): void;
  Resize(): void;
  zoomFitToPage(): void;
  asc_setSpellCheck(isOn: boolean): void;
  SetUnchangedDocument(): void;
  /** A new slide after the current one, with the layout at that index of the master. */
  AddSlide(layoutIndex?: number): void;
  /** Deletes the selected slides. */
  DeleteSlide(): void;
  /** Copies the selected slides (the engine's spelling). */
  DublicateSlide(): void;
  ChangeLayout(layoutIndex: number): void;
  /** Bullets (type 0) or numbering (1) with a subtype from 1; subtype -1 ends the list (CommonController.js fFillBullet). */
  put_ListType(type: number, subtype: number): void;
}

/** The presentation editor's frame (engine/frame/editor/slide/main). */
export interface SlideWindow extends EngineWindow {
  Asc: EngineWindow["Asc"] & {
    asc_docs_api: new (config: Record<string, unknown>) => SlideEngineApi;
  };
}
