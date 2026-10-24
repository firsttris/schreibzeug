import type { TextColor } from "./colors";
import {
  type CommentEvent,
  type CommentsState,
  initialCommentsState,
  isCommentEvent,
  reduceComments,
} from "./comment-state";
import { type CoreState, initialCoreState } from "./core-state";
import type { Align } from "./state";

/** The number formats the toolbar offers; anything else in a file shows as "custom". */
export type NumberFormat = "general" | "number" | "currency" | "percent" | "date" | "text";

/** The formatting of the active cell. */
export type CellFormat = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;
  fontName: string | null;
  fontSize: number | null;
  /** "#rrggbb", or null for automatic. */
  color: TextColor;
  /** "#rrggbb", or null for no fill. */
  fill: TextColor;
  align: Align | null;
  wrap: boolean;
  numberFormat: NumberFormat | "custom";
  /** The selection holds merged cells. */
  merged: boolean;
  /** The selection is more than one cell, so it can be merged. */
  mergeable: boolean;
};

/** `id` is the engine's own (asc_getWorksheetId), which stays when a sheet is renamed or moved. */
export type SheetTab = { id: string; name: string; hidden: boolean };

/** The spreadsheet editor's state: what every document has, the active cell and the sheets. */
export type SheetState = CoreState &
  CommentsState & {
    cell: CellFormat;
    /** The reference of the selection, e.g. "A1" or "B2:C4". */
    reference: string;
    sheets: SheetTab[];
    /** Index into `sheets`. */
    activeSheet: number;
    fonts: string[];
  };

export type SheetEvent =
  | { type: "cell"; value: CellFormat }
  | { type: "reference"; value: string }
  | { type: "sheets"; sheets: SheetTab[]; active: number }
  | { type: "fonts"; value: string[] }
  | CommentEvent;

export const initialCellFormat: CellFormat = {
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
  fontName: null,
  fontSize: null,
  color: null,
  fill: null,
  align: null,
  wrap: false,
  numberFormat: "general",
  merged: false,
  mergeable: false,
};

export const initialSheetState: SheetState = {
  ...initialCoreState,
  cell: initialCellFormat,
  reference: "",
  sheets: [],
  activeSheet: 0,
  fonts: [],
  ...initialCommentsState,
};

export const reduceSheetState = (state: SheetState, event: SheetEvent): SheetState => {
  if (isCommentEvent(event)) return reduceComments(state, event);
  switch (event.type) {
    case "cell":
      return { ...state, cell: event.value };
    case "reference":
      return { ...state, reference: event.value };
    case "sheets":
      return { ...state, sheets: event.sheets, activeSheet: event.active };
    case "fonts":
      return { ...state, fonts: event.value };
  }
};
