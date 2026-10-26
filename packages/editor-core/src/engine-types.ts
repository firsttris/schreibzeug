import type { HeaderFooterApi } from "./header-footer";
import type { LayoutApi, ParagraphSpacing, SectionProps } from "./layout";
import type { HyperlinkProps, LinkApi, SelectedObject } from "./links";
import type { EngineHighlight, MarkingApi } from "./marking";
import type { DisplayModes, RevisionTypes } from "./review";
import type {
  DesignApi,
  DesignConstants,
  EngineSlideProps,
  EngineSlideTransition,
  EngineThemeInfo,
} from "./slide-design";
import type { SlideShowApi } from "./slide-show";
import type { SpellLanguages } from "./spelling";
import type { EngineTableOfContentsPr, InsertApi, InsertConstants } from "./word-insert";
/**
 * The part of the sdkjs API that Schreibzeug uses, typed by hand. sdkjs has no type definitions; every
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
  /** The selection moved to other objects (paragraph, table, image …): common/apiCommon.js asc_CSelectedObject. */
  asc_onFocusObject: [objects: Array<{ asc_getObjectType(): number } & Partial<SelectedObject>>];
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
  /** sync_VerticalAlign: AscCommon.vertalign_Baseline, _SuperScript or _SubScript. */
  asc_onVerticalAlign: [baseline: number];
  /** sync_zoomChangeCallback: the zoom in percent and how it was set (c_oAscZoomType). */
  asc_onZoomChange: [percent: number, type: number];
  /** sync_ContextMenuCallback: a right click in the document. */
  asc_onContextMenu: [data: ContextMenuArgs];
  /** sync_setSearchCurrent: which match is selected (from 0) and how many there are. */
  asc_onSetSearchCurrent: [current: number, total: number];
  /** sync_ReplaceAllCallback: how many matches there were and how many were replaced. */
  asc_onReplaceAll: [total: number, replaced: number];
};

/** common/api/searchSettings.js `CSearchSettings` */
export interface SearchSettings {
  put_Text(text: string): void;
  put_MatchCase(matchCase: boolean): void;
  put_WholeWords(wholeWords: boolean): void;
}

/** Find and replace, named the same in the text and the presentation editor (word/api.js, slide/api.js). */
export interface SearchApi {
  /** Selects the next (or previous) match; returns how many there are. */
  asc_findText(settings: SearchSettings, isNext: boolean): number;
  /** Replaces the current match, or all; false when there was nothing to replace. */
  asc_replaceText(settings: SearchSettings, replaceWith: string, isReplaceAll: boolean): boolean | undefined;
  asc_endFindText(): void;
}

/** word/api.js `CContextMenuData` (slide/api.js has the same getters). */
export interface ContextMenuArgs {
  /** c_oAscContextMenuTypes: Common, or ChangeHdrFtr in a header or footer. */
  get_Type(): number;
  /** Relative to the engine's view element (`id-view`). */
  get_X(): number;
  get_Y(): number;
}

/**
 * Clipboard and zoom, named the same in the text and the presentation editor (word/api.js,
 * slide/api.js; common/clipboard_base.js Button_Copy, Button_Cut, Button_Paste).
 */
export interface ViewApi {
  Copy(): boolean | undefined;
  Cut(): boolean | undefined;
  Paste(): boolean | undefined;
  zoomIn(): void;
  zoomOut(): void;
  zoom(percent: number): void;
  zoomFitToWidth(): void;
  zoomFitToPage(): void;
}

/** Events of the text editor we subscribe to, with the arguments sdkjs passes (word/api.js `sendEvent`). */
export type WordEventArgs = TextEventArgs & {
  /** word/api.js sync_ParaStyleName */
  asc_onParaStyleName: [name: string];
  /** word/api.js sync_InitEditorStyles: the paragraph styles of the document and the defaults */
  asc_onInitEditorStyles: [styles: { get_MergedStyles(): Array<{ get_Name(): string }> }];
  /** Strg+K in the document (word/Editor/Shortcuts.js InsertHyperlink): the UI opens its link dialog. */
  asc_onDialogAddHyperlink: [];
  /** A link was followed with Strg+click (word/api.js sync_HyperlinkClickCallback). */
  asc_onHyperlinkClick: [url: string];
  /** word/api.js sync_TextHighLight: the highlight at the cursor changed (read it from get_TextProps). */
  asc_onTextHighLight: [color: unknown];
  /** word/api.js sync_PaintFormatCallback: c_oAscFormatPainterState, 0 when it is off again. */
  asc_onPaintFormatChanged: [state: number];
  /** word/Editor/Document.js UpdateInterface: the section at the cursor. */
  asc_onSectionProps: [props: SectionProps];
  /** word/api.js sync_ParaSpacingLine: the spacing of the paragraph at the cursor. */
  asc_onParaSpacingLine: [spacing: ParagraphSpacing];
  /** word/api.js sync_OnTrackRevisionsChange: this user's own flag (null: none) and the file's. */
  asc_onOnTrackRevisionsChange: [local: boolean | null, global: boolean, userId?: string];
  /** word/api.js sync_EndCatchRevisionsChanges: the changes at the cursor; `isShow` false for a selection. */
  asc_onShowRevisionsChange: [changes: EngineRevision[], isShow: boolean];
} & CommentEventArgs;

/** common/apiCommon.js asc_CSpellCheckProperty: the word at the cursor, as the spell checker sees it. */
export interface EngineSpellCheck {
  get_Word(): string;
  /** false for a misspelled word. */
  get_Checked(): boolean | null;
  get_Variants(): string[] | null | undefined;
}

/** The spell checker's calls, the same in word/api.js and slide/api.js. */
export interface SpellingApi {
  /** Turns the red underlines of the spell checker on or off. */
  asc_setSpellCheck(isOn: boolean): void;
  asc_replaceMisspelledWord(word: string, spellCheck: EngineSpellCheck): void;
  asc_ignoreMisspelledWord(spellCheck: EngineSpellCheck, all: boolean): void;
}

/** word/Editor/RevisionsChange.js CRevisionsChange: a tracked change. */
export interface EngineRevision {
  get_UserName(): string;
  /** Milliseconds or an ISO date; "" where the file has none. */
  get_DateTime(): number | string | null | undefined;
  /** common/commonDefines.js c_oAscRevisionsChangeType */
  get_Type(): number;
  /** The text for an insertion or deletion: a string, or a list of strings and drawings. */
  get_Value(): unknown;
  get_X(): number;
  get_Y(): number;
}

/** The comment events, named the same in the text and the presentation editor. */
export type CommentEventArgs = {
  /** sync_AddComment (word/api.js, slide/api.js): on open for each comment in the file, and for each new one. */
  asc_onAddComment: [id: string, data: EngineCommentData];
  asc_onChangeCommentData: [id: string, data: EngineCommentData];
  asc_onRemoveComment: [id: string];
  /** The cursor is on commented text, or on a slide's comment (sync_ShowComment). */
  asc_onShowComment: [ids: string[], x?: number, y?: number];
  asc_onHideComment: [];
};

/** The comment calls, the same in word/api.js and slide/api.js. */
export interface CommentApi {
  /** Returns the new comment's id (the spreadsheet engine reports it only with asc_onAddComment). */
  asc_addComment(data: EngineCommentData): string | null | undefined;
  asc_changeComment(id: string, data: EngineCommentData): void;
  asc_removeComment(id: string): void;
  asc_selectComment(id: string): void;
}

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
  /** Whether the document's JS macros may run (asc_runMacros, asc_runAutostartMacroses). */
  put_IsEnabledMacroses(enabled: boolean): void;
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
  /**
   * common/apiBase.js: runs builder code (Api, ApiDocument, …) as plugins do, as one action of the
   * history; the callback gets what the code returned, if it is plain data.
   */
  callCommand(code: string, isRecalculate: boolean, callback: (value: unknown) => void): void;
  /** common/apiBase.js: the hidden input that takes the keys (g_inputContext.HtmlArea). */
  getFocusElement(): HTMLElement;
  /** Whether there are changes not yet saved or, in co-editing, not yet sent. */
  isDocumentModified(): boolean;
  /** Send changes as they happen, instead of when the user saves. */
  asc_SetFastCollaborative(isOn: boolean): void;
  /** common/apiBase.js: seconds between sends of the changes; 0 sends none. */
  asc_setAutoSaveGap(seconds: number): void;
  /** word/api.js, cell/api.js, slide/api.js: true makes the document read-only. */
  asc_setViewMode(isViewMode: boolean): void;
  /** common/apiBase.js: the engine's default keyboard shortcuts, anew. */
  asc_resetAllShortcutTypes(): void;
  /**
   * common/apiBase.js: inserts images by URL at the cursor. URLs already in DocumentUrls go
   * straight to the editor's `_addImageUrl`; others would be sent to the Document Server first.
   */
  AddImageUrl(urls: string[]): void;
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
  /** AscCommon.vertalign_Baseline, _SuperScript or _SubScript for the selection. */
  put_TextPrBaseline(value: number): void;
  /** Removes direct formatting from the selection, keeping the paragraph style. */
  ClearFormating(): void;
  asc_EditSelectAll(): void;
  Undo(): void;
  Redo(): void;
}

/** word/api.js `asc_docs_api` (with common/apiBase.js `baseEditorsApi`) */
export interface WordEngineApi
  extends EngineApiBase<WordEventArgs>,
    SpellingApi,
    CharacterApi,
    ViewApi,
    SearchApi,
    LayoutApi,
    HeaderFooterApi,
    InsertApi,
    LinkApi,
    MarkingApi,
    CommentApi {
  /** word/api.js: the paragraph and character properties at the cursor. */
  get_TextProps(): { get_TextPr(): { get_HighLight(): EngineHighlight } | null };
  SetFontRenderingMode(mode: number): void;
  Resize(): void;
  put_AddPageBreak(): void;
  /**
   * word/Drawing/DrawingDocument.js ToRendererPart: every page as the drawing commands x2t turns
   * into a PDF; what word/api.js `_downloadAs` sends for a PDF or for printing.
   */
  WordControl: {
    m_oDrawingDocument: { ToRendererPart(noBase64: true, isPrint: boolean): Uint8Array };
    /** word/Editor/Document.js `CDocument`, as far as a mail merge reads it (word-mail-merge.ts). */
    m_oLogicDocument: MailMergeDocument;
  };
  /** word/api.js: the recipients of a mail merge, the first row their field names. */
  asc_StartMailMergeByList(rows: string[][]): void;
  asc_GetReceptionsCount(): number;
  /** A MERGEFIELD at the cursor, showing «name» (CDocument.Add_MailMergeField). */
  asc_AddMailMergeField(name: string): void;
  /** Shows the document filled in for one recipient, from 0; the document cannot be edited meanwhile. */
  asc_PreviewMailMergeResult(index: number): void;
  asc_EndPreviewMailMergeResult(): void;
  /** Shades the merge fields, so they are told from text. */
  asc_SetHighlightMailMergeFields(on: boolean): void;
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
  /** Marks commented text in the document; `showResolved` includes resolved comments. */
  asc_showComments(showResolved: boolean): void;
  asc_GetCurrentNumberingId(): string | null;
  asc_GetCurrentNumberingLvl(): number;
  asc_GetNumberingPr(id: string): { get_Lvl(level: number): { get_Format(): number } | null } | null;
  /** word/api.js: how others' changes are marked (common/commonDefines.js c_oAscCollaborativeMarksShowType). */
  SetCollaborativeMarksShowType(type: number): void;
  /** Tracking for this user only; null leaves it to the document's setting. */
  asc_SetLocalTrackRevisions(on: boolean | null): void;
  /** Tracking for the document, stored in the file (w:trackRevisions). */
  asc_SetGlobalTrackRevisions(on: boolean): void;
  /** common/commonDefines.js c_oAscDisplayModeInReview */
  asc_SetDisplayModeInReview(mode: number): void;
  asc_GetNextRevisionsChange(): void;
  asc_GetPrevRevisionsChange(): void;
  asc_AcceptChangesBySelection(moveToNext: boolean): void;
  asc_RejectChangesBySelection(moveToNext: boolean): void;
  asc_AcceptAllChanges(): void;
  asc_RejectAllChanges(): void;
  /** word/api.js: marks the current state as saved and sends asc_onDocumentModifiedChanged. */
  SetUnchangedDocument(): void;
}

/** common/editorscommon.js `DocumentUrls` */
export interface DocumentUrls {
  getUrls(): Record<string, string>;
  addUrls(urls: Record<string, string>): void;
}

/** common/GlobalLoaders.js `g_font_loader`: where the web fonts are and which are loaded. */
export interface FontLoader {
  /** Relative to the frame's page, ending in "/". */
  fontFilesPath: string;
  /** common/Drawings/Externals.js CFontFileLoader: Status 0 or 1 once loaded. */
  fontFiles: Array<{ Id: string; Status: number }>;
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
    vertalign_Baseline: number;
    vertalign_SuperScript: number;
    vertalign_SubScript: number;
    CSearchSettings: new () => SearchSettings;
    g_font_loader: FontLoader;
    /** common/spell/spell.js: the languages the spell checker checks (spelling.ts). */
    spellcheckGetLanguages?: () => SpellLanguages;
    /** common/editorscommon.js: the URLs of the document's images by their path ("media/…"). */
    g_oDocumentUrls: DocumentUrls;
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
    c_oAscTypeSelectElement: { Table: number; Header: number; Hyperlink: number; SpellCheck: number };
    /** word/apiDefines.js */
    c_oAscContextMenuTypes: { Common: number; ChangeHdrFtr: number };
    /** word/Editor/api/document-section-props.js */
    CDocumentSectionProps: new () => SectionProps;
    /** common/commonDefines.js */
    c_oAscPageOrientation: { PagePortrait: number };
    linerule_Auto: number;
    /** common/apiCommon.js */
    CHyperlinkProperty: new () => HyperlinkProps;
    /** common/commonDefines.js */
    c_oAscRevisionsChangeType: RevisionTypes;
    c_oAscDisplayModeInReview: DisplayModes;
    /** word/apiCommon.js */
    CTableOfContentsPr: new () => EngineTableOfContentsPr;
  } & InsertConstants;
  /** word/Editor/Serialize2.js: writes a document in the engine's binary format, as asc_nativeGetFile. */
  AscCommonWord: { BinaryFileWriter: new (document: unknown) => { Write(): string } };
  /** word/Editor/Paragraph/ComplexFields/types.js */
  AscWord: { fieldtype_MERGEFIELD: number };
}

/** A field of the document (word/Editor/Field.js `ParaField`). */
export interface EngineField {
  Get_Argument(index: number): string | undefined;
}

/** word/Editor/Document.js `CDocument`, as a mail merge uses it. */
export interface MailMergeDocument {
  /** The recipients' letters as one document, each after a page break; null without recipients. */
  Get_MailMergedDocument(start?: number, end?: number): unknown | null;
  FieldsManager: { GetAllFieldsByType(type: number): EngineField[] };
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
  /** The filter of the range around the active cell; null where there is no data. */
  asc_getAutoFilterInfo(): EngineAutoFilterInfo | null;
  /** The formatted table the active cell is in, if any. */
  asc_getFormatTableInfo(): { asc_getTableName(): string | null } | null;
  /** common/commonDefines.js c_oAscSelectionType: cells, a chart, a picture … */
  asc_getSelectionType(): number;
  /** The pivot table the active cell is in, if any. */
  asc_getPivotTableInfo(): EnginePivotTable | null;
}

/** cell/model/PivotTables.js CT_DataField: a value of a pivot table, or the change to one. */
export interface EnginePivotValue {
  /** The source column it sums up. */
  asc_getIndex(): number;
  asc_getName(): string | null;
  /** cell/model/PivotTables.js c_oAscDataConsolidateFunction */
  asc_getSubtotal(): number | null;
  asc_setName(name: string): void;
  asc_setSubtotal(subtotal: number): void;
  /** Applies what `change` holds (its fields that are not null) to the value at `index`. */
  asc_set(api: CellEngineApi, pivot: EnginePivotTable, index: number, change: EnginePivotValue): void;
}

/**
 * cell/model/PivotTables.js CT_pivotTableDefinition, the part used here. Field indexes are the
 * source's columns; `dataIndex` is a value's place among the values when it is the one moved.
 */
export interface EnginePivotTable {
  asc_getCacheFields(): Array<{ asc_getName(): string }>;
  asc_getPivotFields(): Array<{ asc_getName(): string | null }>;
  asc_getRowFields(): Array<{ asc_getIndex(): number }> | null;
  asc_getColumnFields(): Array<{ asc_getIndex(): number }> | null;
  asc_getPageFields(): Array<{ asc_getIndex(): number }> | null;
  asc_getDataFields(): EnginePivotValue[] | null;
  /** Numbers go to the values, everything else to the rows (CT_CacheField.isSumSubtotal). */
  asc_addField(api: CellEngineApi, field: number): void;
  asc_removeField(api: CellEngineApi, field: number): void;
  asc_moveToRowField(api: CellEngineApi, field: number, dataIndex?: number): void;
  asc_moveToColField(api: CellEngineApi, field: number, dataIndex?: number): void;
  asc_moveToPageField(api: CellEngineApi, field: number, dataIndex?: number): void;
  asc_moveToDataField(api: CellEngineApi, field: number, dataIndex?: number): void;
  /** Reads the source range again. */
  asc_refresh(api: CellEngineApi): void;
}

/** cell/model/DataValidation.js CDataValidation: the rule on the selected cells. */
export interface EngineDataValidation {
  /** cell/model/Serialize.js EDataValidationType */
  asc_getType(): number;
  asc_setType(type: number): void;
  asc_getFormula1(): { asc_getValue(): string | null } | null;
  asc_setFormula1(formula: { asc_setValue(value: string): void }): void;
  asc_setAllowBlank(allow: boolean): void;
  asc_setShowErrorMessage(show: boolean): void;
}

/** common/apiCommon.js asc_ChartSettings: a chart to add, or the selected one. */
export interface EngineChartSettings {
  /** common/commonDefines.js c_oAscChartTypeSettings */
  getType(): number;
  putType(type: number): void;
  /** The data's range, e.g. "Tabelle1!$A$1:$B$5"; empty without data. */
  getRange(): string | null;
  getInColumns(): boolean | null;
  /** Changes a chart on the sheet to the type, at once. */
  changeType(type: number): boolean | undefined;
}

/** cell/model/CellInfo.js asc_CAutoFilterInfo */
export interface EngineAutoFilterInfo {
  /** true: the range has filter buttons; false: they can be added; null: not here. */
  asc_getIsAutoFilter(): boolean | null;
  /** Some rows are hidden by the filter. */
  asc_getIsApplyAutoFilter(): boolean | null;
}

/** cell/model/autofilters.js AutoFiltersOptionsElements: one value of a column. */
export interface EngineAutoFilterValue {
  asc_getText(): string;
  asc_getVisible(): boolean;
  asc_setVisible(visible: boolean): void;
}

/** cell/model/autofilters.js asc_CAutoFilterObject: what asc_onSetAFDialog hands over. */
export interface EngineAutoFilterObject {
  asc_getCellId(): string;
  asc_getDisplayName(): string;
  /** The filter button, relative to the grid's canvas. */
  asc_getCellCoord(): {
    asc_getX(): number;
    asc_getY(): number;
    asc_getWidth(): number;
    asc_getHeight(): number;
  };
  asc_getValues(): EngineAutoFilterValue[];
  /** common/commonDefines.js c_oAscSortOptions, or something else when not sorted. */
  asc_getSortState(): number | null;
  asc_getFilterObj(): { asc_setType(type: number): void };
}

/** cell/utils/utils.js `asc_CFindOptions` */
export interface CellFindOptions {
  asc_setFindWhat(text: string): void;
  asc_setScanForward(forward: boolean): void;
  asc_setIsMatchCase(matchCase: boolean): void;
  asc_setIsWholeCell(wholeCell: boolean): void;
  /** cell/apiDefines.js c_oAscFindLookIn */
  asc_setLookIn(lookIn: number): void;
  asc_setReplaceWith(text: string): void;
  asc_setIsReplaceAll(all: boolean): void;
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
  /** cell/view/WorkbookView.js: the zoom as a factor, 1 for 100 %. */
  asc_onZoomChanged: [zoom: number];
  /** A right click in the grid, with the mouse event (cell/view/WorkbookView.js onContextMenu). */
  asc_onContextMenu: [event: { clientX: number; clientY: number } | undefined, type?: number];
  /** common/apiBase.js sync_setSearchCurrent, called by WorkbookView.js. */
  asc_onSetSearchCurrent: [current: number, total: number];
  /** How many cells were found and replaced (WorkbookView.js replaceCellText). */
  asc_onRenameCellTextEnd: [found: number, replaced: number];
  /** The comments of a sheet, on open and when it is shown (WorkbookView.js, WorksheetView.js). */
  asc_onAddComments: [comments: CellCommentData[]];
  /** Comments that moved with their cells, or went with them (CellComment.js updateCommentsList). */
  asc_onChangeComments: [changes: Array<{ Id: string; Comment: CellCommentData }>];
  asc_onRemoveComments: [ids: string[]];
  /** A click on a filter button (WorkbookView.js setAutoFiltersDialog). */
  asc_onSetAFDialog: [config: EngineAutoFilterObject];
} & CommentEventArgs;

/** cell/model/CellComment.js asc_CCommentData: the fields of a comment, its id and its cell. */
export interface CellCommentData extends EngineCommentData {
  asc_getId(): string;
  /** false puts it on the active cell, true on the whole workbook (the engine's default). */
  asc_putDocumentFlag(onDocument: boolean): void;
}

/**
 * The part of the spreadsheet's Document Builder API used here (cell/apiBuilder.js): the active
 * sheet's used range, and its values as the cells show them (ApiRange.GetText: one value for one
 * cell, otherwise rows of values; Range.getValueWithFormat).
 */
export type EngineBuilderApi = {
  GetActiveSheet(): { GetUsedRange(): { GetText(): string | string[][] } };
};

/** cell/api.js `spreadsheet_api` (with common/apiBase.js `baseEditorsApi`). */
export interface CellEngineApi extends EngineApiBase<CellEventArgs>, CommentApi {
  /** cell/api.js: draws the comment marks in the cells; `showResolved` includes resolved ones. */
  asc_showComments(showResolved: boolean): void;
  /** The sheet's id, which the ids of its comments carry ("sheet<id>_…", CellComment.js). */
  asc_getWorksheetId(index: number): string;
  asc_setFontRenderingMode(mode: number): void;
  /** cell/api.js: the regional format (LCID), e.g. 0x0407 for German: decimal comma, ";" between arguments. */
  asc_setLocale(lcid: number): void;
  asc_Resize(): void;
  asc_Undo(): void;
  asc_Redo(): void;
  asc_getCellInfo(): EngineCellInfo;
  /** The Document Builder API on the open workbook (cell/api.js getJsApi, cell/apiBuilder.js). */
  getJsApi(): EngineBuilderApi;
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
  asc_Copy(): boolean | undefined;
  asc_Cut(): boolean | undefined;
  asc_Paste(): boolean | undefined;
  /** The zoom as a factor, 1 for 100 %. */
  asc_getZoom(): number;
  asc_setZoom(zoom: number): void;
  /** The number of matches; selects the next (or previous) one. */
  asc_findText(options: CellFindOptions): number | null;
  asc_replaceText(options: CellFindOptions): void;
  /** common/apiBase.js: marks all matches, or takes the marks away. */
  asc_selectSearchingResults(show: boolean): void;
  /** cell/view/WorkbookView.js: the pages a print would have, and the PDF printer that draws them. */
  wb: {
    calcPagesPrint(): unknown;
    printSheets(pages: unknown, renderer: null): { DocumentRenderer: { Memory: { GetData(): Uint8Array } } };
  };
  /** Leaves the cell being typed into; `cancel` drops what was typed. */
  asc_closeCellEditor(cancel?: boolean): void;
  /** cell/apiDefines.js c_oAscSelectionSortExpand: whether sorting should take the rows around along. */
  asc_sortCellsRangeExpand(): number;
  /** Sorts the selection, or a filtered column by its button's cell id and table name. */
  asc_sortColFilter(
    order: number,
    cellId: string,
    displayName?: string,
    color?: unknown,
    expand?: boolean,
  ): void;
  /** Filter buttons on the range around the active cell. */
  asc_addAutoFilter(): void;
  /** cell/apiDefines.js c_oAscChangeFilterOptions.filter with false takes the buttons away. */
  asc_changeAutoFilter(tableName: string | undefined, option: number, value: boolean): void;
  /** Shows every row the filters of the sheet hide. */
  asc_clearFilter(): void;
  asc_applyAutoFilter(config: EngineAutoFilterObject): void;
  /** cell/apiDefines.js c_oAscFrozenPaneAddType; without one, at the active cell or unfrozen. */
  asc_freezePane(type?: number): void;
  asc_getSheetViewSettings(): { asc_getIsFreezePane(): boolean };
  /** The settings for a chart of the selection; `true` without opening the chart editor's frame. */
  asc_getChartSettings(noLock: true): EngineChartSettings | null;
  /** cell/apiDefines.js c_oAscSelectionDialogType.Chart; common/commonDefines.js c_oAscError.ID. */
  asc_checkDataRange(dialog: number, range: string, full: boolean, inRows?: boolean, type?: number): number;
  /** The range a new pivot table would take: the table around the selection (cell/api.js). */
  asc_getAddPivotTableOptions(): { asc_getRange(): string | null } | null;
  /** A pivot table of the source range on a new sheet; undefined where the range has no headings. */
  asc_insertPivotNewWorksheet(source: string, sheetName: string): EnginePivotTable | undefined;
  asc_addChartDrawingObject(settings: EngineChartSettings): void;
  /**
   * The rule of the selection, or an error id (c_oAscError.ID) where it holds different ones; then
   * `true` extends the rule, null starts over (spreadsheeteditor DataTab.js onDataValidation).
   */
  asc_getDataValidationProps(extend?: boolean | null): EngineDataValidation | number | null;
  asc_setDataValidation(props: EngineDataValidation): void;
  /** Rules to set and delete, or a preset: [c_oAscCFRuleTypeSettings, its index in the picker]. */
  asc_setCF(rules: unknown[], deleted: unknown[], preset?: [number, number]): void;
  /** cell/apiDefines.js c_oAscSelectionForCFType */
  asc_clearCF(where: number): void;
  /** The selected drawings: pictures, shapes, charts (asc_CImgProperty with get_ChartProperties). */
  asc_getGraphicObjectProps(): Array<{
    get_ObjectValue(): { get_ChartProperties?: () => EngineChartSettings | null } | null;
  }> | null;
}

/** The spreadsheet editor's frame (engine/frame/editor/cell/main). */
export interface CellWindow extends EngineWindow {
  Asc: EngineWindow["Asc"] & {
    spreadsheet_api: new (config: Record<string, unknown>) => CellEngineApi;
    asc_CCommentData: new () => CellCommentData;
    c_oAscMergeOptions: { Disabled: number; None: number; Merge: number; MergeCenter: number };
    c_oAscInsertOptions: { InsertColumns: number; InsertRows: number };
    c_oAscDeleteOptions: { DeleteColumns: number; DeleteRows: number };
    asc_CFindOptions: new () => CellFindOptions;
    c_oAscFindLookIn: { Formulas: number; Value: number };
    c_oAscSortOptions: { Ascending: number; Descending: number };
    c_oAscSelectionSortExpand: {
      expandAndNotShowMessage: number;
      notExpandAndNotShowMessage: number;
      showExpandMessage: number;
      showLockMessage: number;
    };
    c_oAscChangeFilterOptions: { filter: number; style: number };
    c_oAscFrozenPaneAddType: { firstRow: number; firstCol: number };
    c_oAscAutoFilterTypes: { Filters: number };
    c_oAscChartTypeSettings: {
      barNormal: number;
      hBarNormal: number;
      lineNormal: number;
      pie: number;
      areaNormal: number;
    };
    c_oAscSelectionDialogType: { Chart: number; PivotTableData: number };
    c_oAscError: {
      ID: { No: number; MaxDataSeriesError: number; MoreOneTypeDataValidate: number; DataRangeError: number };
    };
    /** cell/model/PivotTables.js */
    c_oAscDataConsolidateFunction: { Sum: number; Count: number; Average: number; Max: number; Min: number };
    CT_DataField: new () => EnginePivotValue;
    c_oAscEDataValidationType: { None: number; List: number };
    CDataFormula: new () => { asc_setValue(value: string): void };
    c_oAscCFRuleTypeSettings: { dataBar: number; colorScale: number };
    c_oAscSelectionForCFType: { selection: number };
    c_oAscSelectionType: { RangeChart: number; RangeChartText: number };
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
  /** slide/api.js sync_startDemonstration, sync_endDemonstration, sync_DemonstrationSlideChanged */
  asc_onStartDemonstration: [];
  asc_onEndDemonstration: [];
  asc_onDemonstrationSlideChanged: [index: number];
  /** slide/api.js sync_InitEditorThemes: the designs the editor ships with, and the document's. */
  asc_onInitEditorStyles: [styles: [EngineThemeInfo[]?, EngineThemeInfo[]?]];
} & CommentEventArgs;

/** slide/api.js `asc_docs_api` (with common/apiBase.js `baseEditorsApi`). */
export interface SlideEngineApi
  extends EngineApiBase<SlideEventArgs>,
    SpellingApi,
    CharacterApi,
    ViewApi,
    SearchApi,
    SlideShowApi,
    DesignApi,
    CommentApi {
  SetFontRenderingMode(mode: number): void;
  /** Holds back drawing while the document opens (web-apps presentationeditor/mobile Main.jsx). */
  SetDrawingFreeze(freeze: boolean): void;
  /** Where the engine finds its built-in themes. */
  SetThemesPath(path: string): void;
  Resize(): void;
  zoomFitToPage(): void;
  /** slide/api.js: shows the comment marks on the slides. */
  asc_showComments(): void;
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
  /**
   * slide/Drawing/DrawingDocument.js ToRendererPart: every slide as drawing commands for a PDF,
   * what slide/api.js `_downloadAs` sends (the second argument: only the selected slides).
   */
  WordControl: { m_oDrawingDocument: { ToRendererPart(noBase64: true, isSelection: boolean): Uint8Array } };
}

/** The presentation editor's frame (engine/frame/editor/slide/main). */
export interface SlideWindow extends EngineWindow {
  Asc: EngineWindow["Asc"] & {
    asc_docs_api: new (config: Record<string, unknown>) => SlideEngineApi;
    /** slide/apiDefines.js: in the slide, or in the slide list. */
    c_oAscContextMenuTypes: { Main: number; Thumbnails: number };
    /** slide/api.js asc_CCommentDataSlide, a comment on a slide or a reply. */
    asc_CCommentData: new (
      data: null,
    ) => EngineCommentData;
    /** common/commonDefines.js: what a selected object is. */
    c_oAscTypeSelectElement: { SpellCheck: number; Slide: number };
    /** slide/apiCommon.js */
    CAscSlideProps: new () => EngineSlideProps;
    CAscSlideTransition: new () => EngineSlideTransition;
  } & DesignConstants;
}
