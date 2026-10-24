import { commentEvents } from "./comment-state";
import { type CommentCommands, createCommentCommands } from "./comments";
import type { MediaFiles } from "./converter";
import { type EditorBinding, type OpenedDocument, type OpenOptions, openDocument } from "./document";
import type { EngineWindow } from "./engine-types";
import { type PdfColor, rgbOf } from "./pdf-color";
import { addInkSignature, type Stroke } from "./pdf-signature";
import {
  initialPdfState,
  isMarkerTool,
  isShapeTool,
  MARKER_TOOLS,
  type MarkerTool,
  type PdfEvent,
  type PdfState,
  type PdfTool,
  reducePdfState,
  SHAPE_TOOLS,
  type ShapeTool,
} from "./pdf-state";
import type { PdfEngineApi, PdfEventArgs, PdfWindow } from "./pdf-types";
import { type ContextMenuListener, contextMenuSource, createViewCommands, type ViewCommands } from "./view";

/** The colours a tool starts with; web-apps lets them be changed the same way. */
export const DEFAULT_TOOL_COLORS: Record<MarkerTool | ShapeTool | "draw", PdfColor> = {
  highlight: "#ffd400",
  underline: "#2563eb",
  strikeout: "#dc2626",
  draw: "#1e3a8a",
  square: "#dc2626",
  circle: "#dc2626",
  line: "#dc2626",
};

/** Pen widths in millimetres, as asc_CStroke takes them (web-apps pdfeditor Toolbar.js currentSize). */
const PEN_WIDTH = { draw: 0.5, shape: 0.75 };

export type PageCommands = {
  /** The pages selected in the thumbnails, or the page in view when none is, from 0. */
  selected: () => number[];
  /** Turns the selected pages clockwise by 90 degrees, or the other way. */
  rotate: (direction?: "right" | "left") => void;
  /** Removes the selected pages; false when that would leave no page or the engine refuses. */
  remove: () => boolean;
  /** A blank page before or after the page in view. */
  addBlank: (where: "before" | "after") => void;
  /** Puts the pages of another PDF after the page in view, or at the end. */
  append: (pdf: Uint8Array, where: "after" | "end") => void;
  /** The selected pages as a PDF of their own, with what was changed on them. */
  extract: () => Uint8Array;
  goTo: (page: number) => void;
};

export type PdfCommands = {
  /** Switches the tool a click on the page uses; markers and pens take a colour. */
  setTool: (tool: PdfTool, color?: PdfColor) => void;
  /** A text box on the page in view, to type into. */
  addTextBox: () => void;
  /** Blacks out what the redact tool marked, in the file. */
  applyRedactions: () => void;
  hasRedactions: () => boolean;
  undo: () => void;
  redo: () => void;
};

/** A drawn signature, set as ink on the page in view, where it can be moved and sized. */
export type SignatureCommands = { insert: (strokes: Stroke[], color?: PdfColor) => void };

export { type PdfColor, rgbOf } from "./pdf-color";
export type { Stroke } from "./pdf-signature";

export type PdfEditor = OpenedDocument<PdfState> & {
  commands: PdfCommands;
  signature: SignatureCommands;
  pages: PageCommands;
  view: ViewCommands;
  /** Notes on the pages; the engine places a new one on the page in view. */
  comments: CommentCommands;
  /** A right click on a page ("body") or in the page thumbnails ("thumbnails"). */
  onContextMenu: (listener: ContextMenuListener) => () => void;
};

/** The annotation type of a marker or shape tool (pdf/src/defines.js ANNOTATIONS_TYPES). */
const ANNOTATION_NAME = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikeout",
  square: "Square",
  circle: "Circle",
  line: "Line",
} as const;

/** The pen of a shape or ink annotation, as web-apps builds it (pdfeditor Toolbar.js onInsertShapeComment). */
const createPen = (win: PdfWindow, color: PdfColor, width: number) => {
  const pen = new win.Asc.asc_CStroke();
  pen.put_type(win.Asc.c_oAscStrokeType.STROKE_COLOR);
  pen.put_color(new win.Asc.asc_CColor(...rgbOf(color)));
  pen.asc_putPrstDash(win.Asc.c_oDashType.solid);
  pen.put_width(width);
  pen.put_transparent(255);
  return pen;
};

/** Marker opacity in percent, as web-apps' default ("pdfe-annot-opacity-*"). */
const MARKER_OPACITY = 100;

/** Ends a tool the way it was started (pdfeditor Toolbar.js, RedactTab.js). */
const stopTool = (api: PdfEngineApi, tool: PdfTool): void => {
  if (isMarkerTool(tool)) api.SetMarkerFormat(undefined, false);
  else if (tool === "draw") api.asc_StopInkDrawer();
  else if (isShapeTool(tool)) api.StartAddAnnot("", undefined, false);
  else if (tool === "redact") api.SetRedactTool(false);
};

const startTool = (win: PdfWindow, api: PdfEngineApi, tool: PdfTool, color: PdfColor | undefined): void => {
  api.asc_setViewerTargetType(tool === "hand" ? "hand" : "select");
  if (isMarkerTool(tool)) {
    const [r, g, b] = rgbOf(color ?? DEFAULT_TOOL_COLORS[tool]);
    api.SetMarkerFormat(win.AscPDF.ANNOTATIONS_TYPES[ANNOTATION_NAME[tool]], true, MARKER_OPACITY, r, g, b);
  } else if (tool === "draw") {
    api.asc_StartDrawInk(createPen(win, color ?? DEFAULT_TOOL_COLORS.draw, PEN_WIDTH.draw));
  } else if (isShapeTool(tool)) {
    const pen = createPen(win, color ?? DEFAULT_TOOL_COLORS[tool], PEN_WIDTH.shape);
    api.StartAddAnnot(win.AscPDF.ANNOTATIONS_TYPES[ANNOTATION_NAME[tool]], pen, true);
  } else if (tool === "redact") {
    api.SetRedactTool(true);
  }
};

export const createPdfCommands = (
  win: PdfWindow,
  api: PdfEngineApi,
  getState: () => PdfState,
  dispatch: (event: PdfEvent) => void,
): PdfCommands => ({
  setTool: (tool, color) => {
    stopTool(api, getState().tool);
    startTool(win, api, tool, color);
    dispatch({ type: "tool", value: tool });
  },
  addTextBox: () => api.AddFreeTextAnnot(win.AscPDF.FREE_TEXT_INTENT_TYPE.freeText),
  applyRedactions: () => api.ApplyRedact(),
  hasRedactions: () => api.HasRedact(),
  undo: () => api.Undo(),
  redo: () => api.Redo(),
});

/**
 * Pages: turned, added, removed (pdf/api.js), and moved between files the way pages are copied and
 * pasted in web-apps' thumbnails (pdf/src/document.js GetPagesBinary and, in InsertContent,
 * MergePagesBinary).
 */
export const createPageCommands = (win: PdfWindow, api: PdfEngineApi): PageCommands => {
  const selected = () => {
    const pages = api.getSelectedPages();
    return pages.length > 0 ? [...pages].sort((a, b) => a - b) : [api.getCurrentPage()];
  };
  return {
    selected,
    rotate: (direction = "right") => api.asc_RotatePage(direction === "right" ? 90 : -90, selected()),
    remove: () => {
      const pages = selected();
      if (pages.length >= api.getCountPages() || !api.asc_CanRemovePages(pages)) return false;
      api.asc_RemovePage(pages);
      return true;
    },
    addBlank: (where) => api.asc_AddPage(api.getCurrentPage() + (where === "after" ? 1 : 0)),
    append: (pdf, where) => {
      const doc = api.getPDFDoc();
      const position = where === "end" ? api.getCountPages() : api.getCurrentPage() + 1;
      doc.DoAction(() => doc.MergePagesBinary(position, pdf), win.AscDFH.historydescription_Pdf_AddPage, doc);
    },
    extract: () => api.getPDFDoc().GetPagesBinary(selected(), false),
    goTo: (page) => api.goToPage(page),
  };
};

/**
 * Saves the PDF: the editor's changes since it was opened (pdf/src/viewer.js Save, relative to the
 * file it opened), written by x2t into that same file. Without changes the file stays as it is.
 */
export const savePdf = async (
  api: PdfEngineApi,
  options: OpenOptions,
  media: () => Promise<MediaFiles>,
): Promise<Uint8Array> => {
  const changes = api.getDocumentRenderer().Save();
  if (!changes) return options.bytes;
  if (!options.applyPdfChanges) throw new Error("Saving a PDF needs applyPdfChanges.");
  // The images the changes refer to go beside them into "media/", where x2t reads them.
  return options.applyPdfChanges(options.bytes, changes, await media());
};

/**
 * The characters people type into forms and notes: printable ASCII, German letters and the usual
 * punctuation. The PDF editor finds a font for every new character and loads it while typing; until
 * it is there, a form field takes no keys (pdf/src/document.js getTextController → checkFieldFont
 * with the picker's fonts), so the second key of a fast typist went missing.
 */
export const TYPED_CHARACTERS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~" +
  "ÄÖÜäöüß€§°²³µ«»„“”‚‘’–—…•";

/** Loads the fonts for TYPED_CHARACTERS before anyone types, as the picker would on the first key. */
export const preloadTypingFonts = (win: PdfWindow, api: PdfEngineApi): void => {
  win.AscFonts.FontPickerByCharacter.getFontsByString(TYPED_CHARACTERS);
  api.getPDFDoc().checkFonts([], () => {});
};

type PdfParts = Pick<PdfEditor, "commands" | "signature" | "pages" | "view" | "comments" | "onContextMenu">;

/**
 * The PDF editor (pdf/api.js) on top of the shared opening flow (document.ts). It reads the PDF
 * itself, draws the page thumbnails into the host page's `thumbnails-list`, and saves by writing its
 * changes into the original (savePdf).
 */
const pdfBinding: EditorBinding<PdfWindow, PdfEventArgs, PdfEngineApi, PdfState, PdfEvent, PdfParts> = {
  format: "pdf",
  createApi: (win) => new win.Asc.PDFEditorApi({ "id-view": "editor_sdk" }),
  initialState: initialPdfState,
  reduce: reducePdfState,
  events: () => ({
    ...commentEvents(),
    asc_onCountPages: (count) => ({ type: "pages", value: count }),
    asc_onCurrentPage: (page) => ({ type: "currentPage", value: page }),
    asc_onZoomChange: (percent) =>
      Number.isFinite(percent) ? { type: "zoom", value: Math.round(percent) } : null,
    asc_onCanUndo: (value) => ({ type: "canUndo", value: Boolean(value) }),
    asc_onCanRedo: (value) => ({ type: "canRedo", value: Boolean(value) }),
    asc_onMarkerFormatChanged: (_type, on) => (on ? null : { type: "toolEnded", tools: MARKER_TOOLS }),
    asc_onRedactState: (on) => (on ? null : { type: "toolEnded", tools: ["redact"] }),
    asc_onStartAddShapeChanged: (on) => (on ? null : { type: "toolEnded", tools: SHAPE_TOOLS }),
  }),
  setup: ({ win, api, store, dispatch, options }) => ({
    commands: createPdfCommands(win, api, store.get, dispatch),
    signature: {
      insert: (strokes, color = DEFAULT_TOOL_COLORS.draw) => addInkSignature(win, api, strokes, color),
    },
    pages: createPageCommands(win, api),
    view: createViewCommands(api),
    comments: createCommentCommands(
      api,
      () => store.get().comments,
      options.user,
      () => new win.Asc.asc_CCommentDataWord(null),
    ),
    onContextMenu: contextMenuSource(api, () => win.document.getElementById("editor_sdk"), {
      thumbnails: win.Asc.c_oAscPdfContextMenuTypes.Thumbnails,
    }),
  }),
  // Commenting, not editing the page content: web-apps opens a PDF this way (pdfeditor Main.js,
  // isPDFAnnotate → asc_setRestriction(View)). Annotations, form filling and page operations work;
  // without it the editor is the form designer, which shows every field's name and moves fields on
  // a click (pdf/api.js IsEditFieldsMode = canEdit). Comments show on their pages; the page fills
  // the width.
  contentReady: (api, win) => {
    api.asc_setRestriction(win.Asc.c_oAscRestrictionType.View);
    preloadTypingFonts(win, api);
    api.asc_showComments();
    api.Resize();
    api.zoomFitToWidth();
  },
  resize: (api) => api.Resize(),
  markUnchanged: (api) => api.SetUnchangedDocument(),
  saveFile: savePdf,
  // The PDF with the changes made, drawn anew by x2t as PDF/A with the fonts the engine drew it with.
  pdfA: async (api, options, fonts, media) => {
    if (!options.writePdfA) throw new Error("A PDF/A needs writePdfA.");
    return options.writePdfA(options.bytes, api.getDocumentRenderer().Save(), fonts, media);
  },
};

/** Opens a PDF in the PDF editor of a frame mounted with kind "pdf" (see document.ts). */
export const openPdfDocument = (win: EngineWindow, options: OpenOptions): Promise<PdfEditor> =>
  openDocument(win as PdfWindow, options, pdfBinding);
