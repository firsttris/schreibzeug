export type Align = "left" | "center" | "right" | "justify";

export type TextState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number | null;
  fontName: string | null;
  align: Align | null;
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
  document: DocumentState;
};

/** What the engine told us, already translated from sdkjs arguments (see events.ts). */
export type EditorEvent =
  | { type: "bold"; value: boolean }
  | { type: "italic"; value: boolean }
  | { type: "underline"; value: boolean }
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
  text: { bold: false, italic: false, underline: false, fontSize: null, fontName: null, align: null },
  document: { canUndo: false, canRedo: false, modified: false, pages: 0 },
};

const withText = (state: EditorState, text: Partial<TextState>): EditorState => ({
  ...state,
  text: { ...state.text, ...text },
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
