import { initialProgress, isAhead, readProgress, type SessionProgress } from "./session-progress";

/** What every open document has, whatever the editor. */
export type DocumentState = {
  canUndo: boolean;
  canRedo: boolean;
  modified: boolean;
  pages: number;
  /** The zoom in percent, once the engine has told it. */
  zoom: number | null;
  /**
   * False while the connection to the other editors is lost; the engine takes no edits meanwhile
   * and catches up once it is back.
   */
  connected: boolean;
};

export type EditorStatus = "loading" | "ready" | "error";

export type CoreState = {
  status: EditorStatus;
  error: string | null;
  document: DocumentState;
  /** A shared session's change log against the stored file; stays empty when editing alone. */
  session: SessionProgress;
};

/** What every engine tells, translated (events.ts). */
export type CoreEvent =
  | { type: "canUndo"; value: boolean }
  | { type: "canRedo"; value: boolean }
  | { type: "modified"; value: boolean }
  | { type: "pages"; value: number }
  | { type: "zoom"; value: number }
  | { type: "connected"; value: boolean }
  /** A message from the collaboration relay, as JSON text. */
  | { type: "message"; json: string }
  | { type: "ready" }
  | { type: "error"; message: string };

export const initialCoreState: CoreState = {
  status: "loading",
  error: null,
  document: { canUndo: false, canRedo: false, modified: false, pages: 0, zoom: null, connected: true },
  session: initialProgress,
};

const CORE_TYPES: ReadonlySet<string> = new Set([
  "canUndo",
  "canRedo",
  "modified",
  "pages",
  "zoom",
  "connected",
  "message",
  "ready",
  "error",
]);

export const isCoreEvent = (event: { type: string }): event is CoreEvent => CORE_TYPES.has(event.type);

const withDocument = <S extends CoreState>(state: S, document: Partial<DocumentState>): S => ({
  ...state,
  document: { ...state.document, ...document },
});

/** The shared part of every editor's reducer. */
export const reduceCore = <S extends CoreState>(state: S, event: CoreEvent): S => {
  switch (event.type) {
    case "canUndo":
      return withDocument(state, { canUndo: event.value });
    case "canRedo":
      return withDocument(state, { canRedo: event.value });
    case "modified":
      return withDocument(state, { modified: event.value });
    case "pages":
      return withDocument(state, { pages: event.value });
    case "zoom":
      return withDocument(state, { zoom: event.value });
    case "connected":
      return withDocument(state, { connected: event.value });
    case "message": {
      const session = readProgress(state.session, event.json);
      return session === state.session ? state : { ...state, session };
    }
    case "ready":
      return { ...state, status: "ready", error: null };
    case "error":
      return { ...state, status: "error", error: event.message };
  }
};

/** Changes that are not in a stored version yet: the engine's own, or the session's. */
export const hasUnsavedChanges = (state: CoreState): boolean =>
  state.document.modified || isAhead(state.session);
