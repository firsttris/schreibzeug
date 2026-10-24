import { type CoreEvent, type CoreState, initialCoreState, isCoreEvent, reduceCore } from "./core-state";
import type { PageLayout } from "./layout";
import type { Link } from "./links";

export type Align = "left" | "center" | "right" | "justify";

export type ListKind = "bullet" | "number";

/** Where the characters sit: on the line, raised or lowered. */
export type Baseline = "normal" | "superscript" | "subscript";

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
  baseline: Baseline;
};

export type ParagraphState = {
  /** The engine's style name, e.g. "Normal" or "Heading 1". */
  style: string | null;
  list: ListKind | null;
  /** The cursor is in a table, so the table commands apply. */
  inTable: boolean;
  /** The cursor is in a header or footer. */
  inHeaderFooter: boolean;
  /** The link the cursor is in, if any. */
  link: Link | null;
  /** As a multiple of a single line; null for an exact height or a mixed selection. */
  lineSpacing: number | null;
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
  /** The page of the section at the cursor; null until the engine reported it. */
  page: PageLayout | null;
  catalog: CatalogState;
  /** In the order the engine reported them, which is their order in the file. */
  comments: Comment[];
  /** The comments on the text at the cursor. */
  activeComments: string[];
};

/** Character formatting at the cursor and the fonts, from the text or the presentation engine. */
export type TextEvent =
  | { type: "bold"; value: boolean }
  | { type: "italic"; value: boolean }
  | { type: "underline"; value: boolean }
  | { type: "strikeout"; value: boolean }
  | { type: "color"; value: string | null }
  | { type: "fontSize"; value: number }
  | { type: "fontName"; value: string | null }
  | { type: "align"; value: Align | null }
  | { type: "baseline"; value: Baseline }
  | { type: "fonts"; value: string[] };

/** What the text engine told us, already translated from sdkjs arguments (see events.ts). */
export type WordEvent =
  | TextEvent
  | { type: "style"; value: string | null }
  | { type: "list"; value: ListKind | null }
  | { type: "inTable"; value: boolean }
  | { type: "inHeaderFooter"; value: boolean }
  | { type: "link"; value: Link | null }
  | { type: "lineSpacing"; value: number | null }
  | { type: "page"; value: PageLayout }
  | { type: "styles"; value: string[] }
  | { type: "commentSet"; comment: Comment }
  | { type: "commentRemoved"; id: string }
  | { type: "activeComments"; ids: string[] };

export type EditorEvent = WordEvent | CoreEvent;

export const initialTextState: TextState = {
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
  color: null,
  fontSize: null,
  fontName: null,
  align: null,
  baseline: "normal",
};

const TEXT_FIELDS: Record<Exclude<TextEvent["type"], "fonts">, keyof TextState> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikeout: "strikeout",
  color: "color",
  fontSize: "fontSize",
  fontName: "fontName",
  align: "align",
  baseline: "baseline",
};

const isTextEvent = (event: { type: string }): event is TextEvent =>
  event.type in TEXT_FIELDS || event.type === "fonts";

/** The shared part of the text and the presentation editor's reducer. */
export const reduceTextEvent = <S extends { text: TextState; catalog: CatalogState }>(
  state: S,
  event: TextEvent,
): S =>
  event.type === "fonts"
    ? { ...state, catalog: { ...state.catalog, fonts: event.value } }
    : { ...state, text: { ...state.text, [TEXT_FIELDS[event.type]]: event.value } };

export const initialEditorState: EditorState = {
  ...initialCoreState,
  text: initialTextState,
  paragraph: {
    style: null,
    list: null,
    inTable: false,
    inHeaderFooter: false,
    link: null,
    lineSpacing: null,
  },
  page: null,
  catalog: { fonts: [], styles: [] },
  comments: [],
  activeComments: [],
};

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
  if (isTextEvent(event)) return reduceTextEvent(state, event);
  switch (event.type) {
    case "style":
      return withParagraph(state, { style: event.value });
    case "list":
      return withParagraph(state, { list: event.value });
    case "inTable":
      return withParagraph(state, { inTable: event.value });
    case "link":
      return withParagraph(state, { link: event.value });
    case "inHeaderFooter":
      return withParagraph(state, { inHeaderFooter: event.value });
    case "lineSpacing":
      return withParagraph(state, { lineSpacing: event.value });
    case "page":
      return { ...state, page: event.value };
    case "styles":
      return withCatalog(state, { styles: event.value });
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
