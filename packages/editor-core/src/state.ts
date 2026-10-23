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
};

/** What the engine offers to choose from. */
export type CatalogState = {
  fonts: string[];
  styles: string[];
};

export type DocumentState = {
  canUndo: boolean;
  canRedo: boolean;
  modified: boolean;
  pages: number;
};

export type EditorStatus = "loading" | "ready" | "error";

export type EditorState = {
  status: EditorStatus;
  error: string | null;
  text: TextState;
  paragraph: ParagraphState;
  catalog: CatalogState;
  document: DocumentState;
};

/** What the engine told us, already translated from sdkjs arguments (see events.ts). */
export type EditorEvent =
  | { type: "bold"; value: boolean }
  | { type: "italic"; value: boolean }
  | { type: "underline"; value: boolean }
  | { type: "strikeout"; value: boolean }
  | { type: "color"; value: string | null }
  | { type: "style"; value: string | null }
  | { type: "list"; value: ListKind | null }
  | { type: "fonts"; value: string[] }
  | { type: "styles"; value: string[] }
  | { type: "fontSize"; value: number }
  | { type: "fontName"; value: string | null }
  | { type: "align"; value: Align | null }
  | { type: "canUndo"; value: boolean }
  | { type: "canRedo"; value: boolean }
  | { type: "modified"; value: boolean }
  | { type: "pages"; value: number }
  | { type: "ready" }
  | { type: "error"; message: string };

export const initialEditorState: EditorState = {
  status: "loading",
  error: null,
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
  paragraph: { style: null, list: null },
  catalog: { fonts: [], styles: [] },
  document: { canUndo: false, canRedo: false, modified: false, pages: 0 },
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

const withDocument = (state: EditorState, document: Partial<DocumentState>): EditorState => ({
  ...state,
  document: { ...state.document, ...document },
});

export const reduceEditorState = (state: EditorState, event: EditorEvent): EditorState => {
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
    case "canUndo":
      return withDocument(state, { canUndo: event.value });
    case "canRedo":
      return withDocument(state, { canRedo: event.value });
    case "modified":
      return withDocument(state, { modified: event.value });
    case "pages":
      return withDocument(state, { pages: event.value });
    case "ready":
      return { ...state, status: "ready", error: null };
    case "error":
      return { ...state, status: "error", error: event.message };
  }
};
