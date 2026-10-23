import { type CoreEvent, type CoreState, initialCoreState, isCoreEvent, reduceCore } from "./core-state";

export type Align = "left" | "center" | "right" | "justify";

export type ListKind = "bullet" | "number";

export type TextState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;
  /** "#rrggbb", or null for automatic. */
  color: string | null;
  fontSize: number | null;
  fontName: string | null;
  align: Align | null;
};

export type ParagraphState = {
  /** The engine's style name, e.g. "Normal" or "Heading 1". */
  style: string | null;
  list: ListKind | null;
  /** The cursor is in a table, so the table commands apply. */
  inTable: boolean;
};

/** What the engine offers to choose from. */
export type CatalogState = {
  fonts: string[];
  styles: string[];
};

export type CommentEntry = {
  authorId: string;
  author: string;
  text: string;
  /** Milliseconds since 1970. */
  time: number;
};

export type Comment = CommentEntry & {
  id: string;
  /** The commented text, or null for a comment at the cursor. */
  quote: string | null;
  resolved: boolean;
  /** Kept as the file has it (w15:commentEx paraId), so a resolved state survives saving. */
  guid: string;
  replies: CommentEntry[];
};

/** The text editor's state: what every document has, and the formatting at the cursor. */
export type EditorState = CoreState & {
  text: TextState;
  paragraph: ParagraphState;
  catalog: CatalogState;
  /** In the order the engine reported them, which is their order in the file. */
  comments: Comment[];
  /** The comments on the text at the cursor. */
  activeComments: string[];
};

/** What the text engine told us, already translated from sdkjs arguments (see events.ts). */
export type WordEvent =
  | { type: "bold"; value: boolean }
  | { type: "italic"; value: boolean }
  | { type: "underline"; value: boolean }
  | { type: "strikeout"; value: boolean }
  | { type: "color"; value: string | null }
  | { type: "style"; value: string | null }
  | { type: "list"; value: ListKind | null }
  | { type: "inTable"; value: boolean }
  | { type: "fonts"; value: string[] }
  | { type: "styles"; value: string[] }
  | { type: "fontSize"; value: number }
  | { type: "fontName"; value: string | null }
  | { type: "align"; value: Align | null }
  | { type: "commentSet"; comment: Comment }
  | { type: "commentRemoved"; id: string }
  | { type: "activeComments"; ids: string[] };

export type EditorEvent = WordEvent | CoreEvent;

export const initialEditorState: EditorState = {
  ...initialCoreState,
  text: {
    bold: false,
    italic: false,
    underline: false,
    strikeout: false,
    color: null,
    fontSize: null,
    fontName: null,
    align: null,
  },
  paragraph: { style: null, list: null, inTable: false },
  catalog: { fonts: [], styles: [] },
  comments: [],
  activeComments: [],
};

const withText = (state: EditorState, text: Partial<TextState>): EditorState => ({
  ...state,
  text: { ...state.text, ...text },
});

const withParagraph = (state: EditorState, paragraph: Partial<ParagraphState>): EditorState => ({
  ...state,
  paragraph: { ...state.paragraph, ...paragraph },
});

const withCatalog = (state: EditorState, catalog: Partial<CatalogState>): EditorState => ({
  ...state,
  catalog: { ...state.catalog, ...catalog },
});

/** Replaces the comment with the same id in place, or adds it at the end. */
const setComment = (comments: Comment[], comment: Comment): Comment[] =>
  comments.some((existing) => existing.id === comment.id)
    ? comments.map((existing) => (existing.id === comment.id ? comment : existing))
    : [...comments, comment];

export const reduceEditorState = (state: EditorState, event: EditorEvent): EditorState => {
  if (isCoreEvent(event)) return reduceCore(state, event);
  switch (event.type) {
    case "bold":
      return withText(state, { bold: event.value });
    case "italic":
      return withText(state, { italic: event.value });
    case "underline":
      return withText(state, { underline: event.value });
    case "strikeout":
      return withText(state, { strikeout: event.value });
    case "color":
      return withText(state, { color: event.value });
    case "style":
      return withParagraph(state, { style: event.value });
    case "list":
      return withParagraph(state, { list: event.value });
    case "inTable":
      return withParagraph(state, { inTable: event.value });
    case "fonts":
      return withCatalog(state, { fonts: event.value });
    case "styles":
      return withCatalog(state, { styles: event.value });
    case "fontSize":
      return withText(state, { fontSize: event.value });
    case "fontName":
      return withText(state, { fontName: event.value });
    case "align":
      return withText(state, { align: event.value });
    case "commentSet":
      return { ...state, comments: setComment(state.comments, event.comment) };
    case "commentRemoved":
      return {
        ...state,
        comments: state.comments.filter((comment) => comment.id !== event.id),
        activeComments: state.activeComments.filter((id) => id !== event.id),
      };
    case "activeComments":
      return { ...state, activeComments: event.ids };
  }
};
