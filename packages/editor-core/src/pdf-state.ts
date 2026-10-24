import {
  type CommentEvent,
  type CommentsState,
  initialCommentsState,
  isCommentEvent,
  reduceComments,
} from "./comment-state";
import { type CoreState, initialCoreState } from "./core-state";

/**
 * What a click on the page does: select text and objects, move the page, mark text, draw freehand,
 * draw a shape, or mark what to black out.
 */
export type PdfTool =
  | "select"
  | "hand"
  | "highlight"
  | "underline"
  | "strikeout"
  | "draw"
  | "square"
  | "circle"
  | "line"
  | "redact";

export const MARKER_TOOLS = ["highlight", "underline", "strikeout"] as const;
export const SHAPE_TOOLS = ["square", "circle", "line"] as const;
export type MarkerTool = (typeof MARKER_TOOLS)[number];
export type ShapeTool = (typeof SHAPE_TOOLS)[number];

export const isMarkerTool = (tool: PdfTool): tool is MarkerTool =>
  (MARKER_TOOLS as readonly string[]).includes(tool);
export const isShapeTool = (tool: PdfTool): tool is ShapeTool =>
  (SHAPE_TOOLS as readonly string[]).includes(tool);

/** The PDF editor's state; the number of pages is `document.pages`. */
export type PdfState = CoreState &
  CommentsState & {
    /** The page in view, from 0. */
    currentPage: number;
    tool: PdfTool;
  };

export type PdfEvent =
  | { type: "currentPage"; value: number }
  | { type: "tool"; value: PdfTool }
  /** The engine ended a tool by itself, e.g. a marker after the text was marked once. */
  | { type: "toolEnded"; tools: readonly PdfTool[] }
  | CommentEvent;

export const initialPdfState: PdfState = {
  ...initialCoreState,
  ...initialCommentsState,
  currentPage: 0,
  tool: "select",
};

export const reducePdfState = (state: PdfState, event: PdfEvent): PdfState => {
  if (isCommentEvent(event)) return reduceComments(state, event);
  switch (event.type) {
    case "currentPage":
      return { ...state, currentPage: event.value };
    case "tool":
      return { ...state, tool: event.value };
    case "toolEnded":
      return event.tools.includes(state.tool) ? { ...state, tool: "select" } : state;
  }
};
