import type {
  CommentApi,
  CommentEventArgs,
  CommonEventArgs,
  EngineApiBase,
  EngineColor,
  EngineCommentData,
  EngineWindow,
  ViewApi,
} from "./engine-types";

/**
 * The part of the PDF editor's API that Schreibzeug uses, typed by hand like engine-types.ts. The
 * editor is `PDFEditorApi` (sdkjs pdf/api.js), built into the text-document bundle; every member is
 * named after its source.
 */

/** pdf/api.js `CPdfContextMenuData` */
export interface PdfContextMenuArgs {
  /** `c_oAscPdfContextMenuTypes`: Common 0, Thumbnails 1. */
  get_Type(): number;
  get_X(): number;
  get_Y(): number;
  get_PageNum(): number;
}

/** Events of the PDF editor (pdf/api.js, pdf/src/document.js, pdf/src/viewer.js `sendEvent`). */
export type PdfEventArgs = CommonEventArgs &
  CommentEventArgs & {
    asc_onCountPages: [count: number];
    /** The page in view, from 0. */
    asc_onCurrentPage: [page: number];
    asc_onZoomChange: [percent: number];
    asc_onCanUndo: [canUndo: boolean];
    asc_onCanRedo: [canRedo: boolean];
    /** A marker tool (highlight, underline, strikeout) switched on or off: its annotation type. */
    asc_onMarkerFormatChanged: [type: number | undefined, on: boolean];
    /** pdf/api.js SetRedactTool */
    asc_onRedactState: [on: boolean];
    /** pdf/api.js: drawing a shape annotation started or ended. */
    asc_onStartAddShapeChanged: [on: boolean];
    asc_onContextMenu: [data: PdfContextMenuArgs];
  };

/** common/apiCommon.js `asc_CStroke`: the pen of a shape or ink annotation. */
export interface EngineStroke {
  put_type(type: number): void;
  put_color(color: EngineColor): void;
  put_width(width: number): void;
  put_transparent(alpha: number): void;
  asc_putPrstDash(dash: number): void;
}

/** pdf/src/annotations/base.js and ink.js: the calls an ink signature needs (pdf-signature.ts). */
export interface PdfAnnotation {
  SetBorderWidth(width: number): void;
  SetBorderStyle(style: number): void;
  /** RGB from 0 to 1. */
  SetBorderColor(rgb: number[]): void;
  /** Ink only: the strokes as flat [x, y, x, y, …] in page points from the top left. */
  SetInkPoints(paths: number[][]): void;
}

/** pdf/src/viewer.js `CHtmlPage`, as far as placing a stamp reads it. */
export interface PdfViewer {
  currentPage: number;
  getPageRotate(page: number): number;
  /** The part of the page in view, as fractions of its width and height. */
  getViewingRect(page: number): { x: number; y: number; r: number; b: number };
  file: PdfFile;
}

/** pdf/src/file.js `CFile`: the file as drawingfile.wasm reads it. */
export interface PdfFile {
  /** The pages, without their rotation, in pixels at Dpi (pdf/src/viewer.js). */
  pages: Array<{ W: number; H: number; Dpi: number }>;
  /** The page drawn at this size; null when it is not in the file (a page added since). */
  getPage(
    page: number,
    width: number,
    height: number,
    noCache: boolean,
    background: number,
  ): HTMLCanvasElement | null;
}

/** The PDF document behind the editor (pdf/src/document.js `CPDFDoc`). */
export interface PdfDocument {
  Viewer: PdfViewer;
  AddAnnotByProps(props: Record<string, unknown>): PdfAnnotation;
  GetPagesCount(): number;
  /**
   * Loads the fonts by name and those the character picker has collected; true when all are there
   * already, otherwise the callback follows once they are.
   */
  checkFonts(names: string[], callback: () => void): boolean;
  /** One step of the history: the action, its description (AscDFH), `this` for it. */
  DoAction(action: () => void, description: number, self: unknown): void;
  /** Puts the pages of another PDF in at this position, from 0 (pages pasted in the thumbnails). */
  MergePagesBinary(position: number, pdf: Uint8Array): void;
  /** These pages, from 0, as a PDF of their own with the changes made to them; base64 unless false. */
  GetPagesBinary(pages: number[], base64: false): Uint8Array;
}

/** pdf/src/viewer.js `CHtmlPage`: the renderer that holds the file. */
export interface PdfRenderer {
  /** The changes since the file was opened, as x2t reads them ("%PDF" + changes), or null. */
  Save(): Uint8Array | null;
}

export interface PdfEngineApi extends EngineApiBase<PdfEventArgs>, CommentApi, ViewApi {
  getPDFDoc(): PdfDocument;
  getDocumentRenderer(): PdfRenderer;
  getCountPages(): number;
  getCurrentPage(): number;
  goToPage(page: number): void;
  /** The pages selected in the thumbnails, from 0. */
  getSelectedPages(): number[];
  /** Rotates the pages by the angle, in degrees, clockwise. */
  asc_RotatePage(angle: number, pages: number[]): void;
  asc_RemovePage(pages: number[]): void;
  asc_CanRemovePages(pages: number[]): boolean;
  /** A blank page at this position, from 0. */
  asc_AddPage(position: number): void;
  /**
   * A marker tool on the selected text: the annotation type and colour, or off (`value` false).
   * pdf/api.js SetMarkerFormat(nType, value, opacity, r, g, b).
   */
  SetMarkerFormat(
    type: number | undefined,
    value: boolean,
    opacity?: number,
    r?: number,
    g?: number,
    b?: number,
  ): void;
  /** Starts drawing a shape annotation with this pen, or stops (type ""). */
  StartAddAnnot(type: number | "", pen: EngineStroke | undefined, apply: boolean): void;
  /** A text box annotation on the current page (`FREE_TEXT_INTENT_TYPE`). */
  AddFreeTextAnnot(intent: number): void;
  /** Marks text or areas to black out; ApplyRedact blacks them out in the file. */
  SetRedactTool(on: boolean): void;
  ApplyRedact(): void;
  HasRedact(): boolean;
  /** common/apiBase.js: freehand drawing with this pen, until asc_StopInkDrawer. */
  asc_StartDrawInk(pen: EngineStroke): void;
  asc_StopInkDrawer(): void;
  /** word/api.js: "select" selects text and objects, "hand" moves the page. */
  asc_setViewerTargetType(type: "select" | "hand"): void;
  Undo(): void;
  Redo(): void;
  Resize(): void;
  asc_showComments(): void;
  SetUnchangedDocument(): void;
  /** The user the document was opened for (asc_CUserInfo). */
  User: { asc_getUserName(): string };
  /** common/apiBase.js: `c_oAscRestrictionType`; View keeps the page content and form design fixed. */
  asc_setRestriction(restriction: number): void;
}

/** The PDF editor's frame (engine/frame/editor/pdf/main). */
export interface PdfWindow extends EngineWindow {
  /** common/editorscommon.js CreateGUID: the name of a new annotation. */
  AscCommon: EngineWindow["AscCommon"] & { CreateGUID(): string };
  Asc: EngineWindow["Asc"] & {
    PDFEditorApi: new (config: Record<string, unknown>) => PdfEngineApi;
    asc_CCommentDataWord: new (data: null) => EngineCommentData;
    asc_CStroke: new () => EngineStroke;
    /** common/commonDefines.js */
    c_oAscStrokeType: { STROKE_COLOR: number };
    /** common/commonDefines.js `c_oDashType` */
    c_oDashType: { solid: number };
    c_oAscPdfContextMenuTypes: { Thumbnails: number };
    /** common/commonDefines.js */
    c_oAscRestrictionType: { View: number };
  };
  /** common/HistoryCommon.js */
  AscDFH: { historydescription_Pdf_AddPage: number; historydescription_Pdf_AddAnnot: number };
  /** common/libfont: the font picker that finds a font for each character typed. */
  AscFonts: { FontPickerByCharacter: { getFontsByString(text: string): void } };
  /** pdf/src/defines.js, pdf/src/annotations/freeText.js */
  AscPDF: {
    ANNOTATIONS_TYPES: Record<
      "Highlight" | "Underline" | "Strikeout" | "Square" | "Circle" | "Line" | "Ink",
      number
    >;
    /** pdf/src/defines.js */
    BORDER_TYPES: { solid: number };
    FREE_TEXT_INTENT_TYPE: { freeText: number };
  };
}
