import { createEngineColor } from "./colors";
import { createTextCommands, type TextCommands } from "./commands";
import { type CommentCommands, createCommentCommands } from "./comments";
import { type EditorBinding, type OpenedDocument, type OpenOptions, openDocument } from "./document";
import type { EngineWindow, WordEngineApi, WordEventArgs, WordWindow } from "./engine-types";
import { stateEvents } from "./events";
import { createHeaderFooterCommands, type HeaderFooterCommands } from "./header-footer";
import { createLayoutCommands, type LayoutCommands, readLineSpacing, readSection } from "./layout";
import { createLinkCommands, type HyperlinkProps, type LinkCommands, readLink } from "./links";
import { readListKind } from "./lists";
import { createMarkingCommands, type MarkingCommands, readHighlight } from "./marking";
import { createSearchCommands, type SearchCommands } from "./search";
import {
  type EditorEvent,
  type EditorState,
  initialEditorState,
  reduceEditorState,
  type WordEvent,
} from "./state";
import {
  type ContextMenuListener,
  contextMenuSource,
  createListeners,
  createViewCommands,
  type ViewCommands,
} from "./view";

export type OpenWordOptions = OpenOptions;

export type WordEditor = OpenedDocument<EditorState> & {
  commands: TextCommands;
  layout: LayoutCommands;
  headerFooter: HeaderFooterCommands;
  links: LinkCommands;
  marking: MarkingCommands;
  /** Strg+K in the document: the listener opens the link dialog. Returns the unsubscribe. */
  onLinkRequest: (listener: () => void) => () => void;
  /** Strg+click on a link: the listener opens the address. Returns the unsubscribe. */
  onLinkOpen: (listener: (url: string) => void) => () => void;
  comments: CommentCommands;
  view: ViewCommands;
  search: SearchCommands;
  /** Someone right-clicked in the document; the listener shows the menu. Returns the unsubscribe. */
  onContextMenu: (listener: ContextMenuListener) => () => void;
};

/** sdkjs `SetFontRenderingMode`: 3 = hinting for normal screens, 1 = none for high-DPI (web-apps uses the same). */
export const fontRenderingMode = (devicePixelRatio: number): number => (devicePixelRatio > 1 ? 1 : 3);

/**
 * put_ListTypeCustom applies the list in a promise and the selection does not move, so no
 * asc_onFocusObject follows; the list at the cursor is read again once it is applied.
 */
const withListRefresh = (commands: TextCommands, refreshList: () => void): TextCommands => ({
  ...commands,
  toggleList: (kind) => commands.toggleList(kind).then(refreshList),
});

/**
 * SetPaintFormat sets the painter without telling (word/api.js); the engine reports only that it
 * is off again (sync_PaintFormatCallback). web-apps keeps the button state itself, and so does this.
 */
const withPainterState = (commands: MarkingCommands, report: (on: boolean) => void): MarkingCommands => ({
  ...commands,
  togglePaintFormat: (on) => {
    commands.togglePaintFormat(on);
    report(on);
  },
});

/** The text editor (word/api.js) on top of the shared opening flow (document.ts). */
const wordBinding: EditorBinding<
  WordWindow,
  WordEventArgs,
  WordEngineApi,
  EditorState,
  WordEvent,
  Pick<
    WordEditor,
    | "commands"
    | "layout"
    | "headerFooter"
    | "links"
    | "marking"
    | "onLinkRequest"
    | "onLinkOpen"
    | "comments"
    | "view"
    | "search"
    | "onContextMenu"
  >
> = {
  format: "docx",
  createApi: (win) => {
    const api = new win.Asc.asc_docs_api({ "id-view": "editor_sdk", translate: {} });
    api.SetFontRenderingMode(fontRenderingMode(win.devicePixelRatio));
    return api;
  },
  initialState: initialEditorState,
  reduce: (state, event) => reduceEditorState(state, event as EditorEvent),
  events: (win) => stateEvents(win.AscCommon, win.Asc.c_oAscAsyncAction.Disconnect),
  setup: ({ win, api, store, dispatch, options }) => {
    const refreshList = () =>
      dispatch({ type: "list", value: readListKind(api, win.Asc.c_oAscNumberingFormat) });
    api.asc_registerCallback("asc_onFocusObject", (objects) => {
      refreshList();
      const { Table, Header, Hyperlink } = win.Asc.c_oAscTypeSelectElement;
      const has = (type: number) => objects.some((object) => object.asc_getObjectType() === type);
      dispatch({ type: "inTable", value: has(Table) });
      // word/api.js sync_HeadersAndFootersPropCallback: a header or footer is being edited.
      dispatch({ type: "inHeaderFooter", value: has(Header) });
      const link = objects.find((object) => object.asc_getObjectType() === Hyperlink);
      dispatch({ type: "link", value: link ? readLink(link.get_ObjectValue?.() as HyperlinkProps) : null });
    });
    const layoutConstants = {
      portrait: win.Asc.c_oAscPageOrientation.PagePortrait,
      lineRuleAuto: win.Asc.linerule_Auto,
    };
    api.asc_registerCallback("asc_onSectionProps", (props) =>
      dispatch({ type: "page", value: readSection(props, layoutConstants) }),
    );
    api.asc_registerCallback("asc_onParaSpacingLine", (spacing) =>
      dispatch({ type: "lineSpacing", value: readLineSpacing(spacing, layoutConstants) }),
    );
    api.asc_registerCallback("asc_onTextHighLight", () =>
      dispatch({
        type: "highlight",
        value: readHighlight(api.get_TextProps().get_TextPr()?.get_HighLight()),
      }),
    );
    api.asc_registerCallback("asc_onPaintFormatChanged", (state) =>
      dispatch({ type: "painting", value: state !== 0 }),
    );
    const linkRequests = createListeners<void>();
    const linkOpens = createListeners<string>();
    api.asc_registerCallback("asc_onDialogAddHyperlink", () => linkRequests.emit());
    api.asc_registerCallback("asc_onHyperlinkClick", (url) => linkOpens.emit(url));
    const onContextMenu = contextMenuSource(api, () => win.document.getElementById("editor_sdk"), {
      headerFooter: win.Asc.c_oAscContextMenuTypes.ChangeHdrFtr,
    });
    return {
      view: createViewCommands(api),
      search: createSearchCommands(
        api,
        () => new win.AscCommon.CSearchSettings(),
        () => dispatch({ type: "searchCurrent", current: -1, total: 0 }),
      ),
      onContextMenu,
      links: createLinkCommands(
        api,
        () => new win.Asc.CHyperlinkProperty(),
        win.Asc.c_oAscTypeSelectElement.Hyperlink,
      ),
      marking: withPainterState(createMarkingCommands(api), (on) =>
        dispatch({ type: "painting", value: on }),
      ),
      onLinkRequest: linkRequests.add,
      onLinkOpen: linkOpens.add,
      headerFooter: createHeaderFooterCommands(api, () => {
        win.focus();
        api.getFocusElement().focus();
      }),
      layout: createLayoutCommands(api, () => new win.Asc.CDocumentSectionProps(), layoutConstants),
      commands: withListRefresh(
        createTextCommands(api, store.get, win.AscCommon, createEngineColor(win.Asc.asc_CColor)),
        refreshList,
      ),
      comments: createCommentCommands(
        api,
        store.get,
        options.user,
        () => new win.Asc.asc_CCommentDataWord(null),
      ),
    };
  },
  contentReady: (api, win, shared) => {
    // Spell checking needs the Document Server's dictionary service, which Stapel does not run:
    // without it every word is marked. web-apps switches it here too (documenteditor/mobile Main.jsx).
    api.asc_setSpellCheck(false);
    // The engine's shortcut table stays empty unless the UI fills it, so Strg+K did nothing; web-apps
    // resets it to the defaults once the editor runs (common/main/lib/controller/Shortcuts.js →
    // common/apiBase.js asc_resetAllShortcutTypes, word/Editor/Shortcuts.js c_oAscDefaultShortcuts).
    api.asc_resetAllShortcutTypes();
    // Marks commented text and reports the comments at the cursor (asc_onShowComment), as web-apps
    // does with live commenting on; resolved comments stay unmarked.
    api.asc_showComments(false);
    // Others' text is not highlighted; web-apps sets this for the text editor only (Collaboration.jsx).
    if (shared) api.SetCollaborativeMarksShowType(win.Asc.c_oAscCollaborativeMarksShowType.None);
    api.Resize();
    api.zoomFitToWidth();
  },
  resize: (api) => api.Resize(),
  // word/api.js: marks the current state as saved and sends asc_onDocumentModifiedChanged.
  markUnchanged: (api) => api.SetUnchangedDocument(),
  // As word/api.js `_downloadAs` for a PDF to print: all pages, printed look (no marks).
  printCommands: (api) => api.WordControl.m_oDrawingDocument.ToRendererPart(true, true),
};

/** Opens a .docx in the text engine of a frame mounted with kind "word" (see document.ts). */
export const openWordDocument = (win: EngineWindow, options: OpenWordOptions): Promise<WordEditor> =>
  openDocument(win as WordWindow, options, wordBinding);
