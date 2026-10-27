import { createEngineColor } from "./colors";
import { type CharacterCommands, createCharacterCommands } from "./commands";
import { commentEvents } from "./comment-state";
import { type CommentCommands, createCommentCommands } from "./comments";
import {
  EDITOR_FORMAT,
  type EditorBinding,
  type OpenedDocument,
  type OpenOptions,
  openDocument,
} from "./document";
import { SLIDE_TEXTS } from "./engine-texts";
import type { EngineWindow, SlideEngineApi, SlideEventArgs, SlideWindow } from "./engine-types";
import { textEvents } from "./events";
import { createSearchCommands, type SearchCommands } from "./search";
import { createDesignCommands, type DesignCommands, readThemes, readTransition } from "./slide-design";
import { createSlideShow, hideShowElement, SLIDE_SHOW_ELEMENT, type SlideShow } from "./slide-show";
import { initialSlideState, reduceSlideState, type SlideEvent, type SlideState } from "./slide-state";
import { limitSpellLanguages, type SpellingCommands, useDedicatedSpellWorker } from "./spelling";
import type { ListKind } from "./state";
import { type ContextMenuListener, contextMenuSource, createViewCommands, type ViewCommands } from "./view";
import { fontRenderingMode, spellingFor } from "./word";

export type SlideCommands = CharacterCommands & {
  /** Starts a list of this kind, or ends it when the paragraph is in one already. */
  toggleList: (kind: ListKind) => void;
  /** A new slide after the current one; without a layout the engine picks the usual next one. */
  addSlide: (layoutIndex?: number) => void;
  duplicateSlide: () => void;
  deleteSlide: () => void;
  setLayout: (layoutIndex: number) => void;
};

export type PresentationEditor = OpenedDocument<SlideState> & {
  commands: SlideCommands;
  view: ViewCommands;
  search: SearchCommands;
  /** Full screen presentation; the app makes the frame full screen first. */
  slideShow: SlideShow;
  /** Comments on slides; the engine anchors a new one to the current slide. */
  comments: CommentCommands;
  /** The spell checker and the misspelled word at the cursor. */
  spelling: SpellingCommands;
  /** A right click on the slide (area "body") or in the slide list ("thumbnails"). */
  onContextMenu: (listener: ContextMenuListener) => () => void;
  /** Shapes, designs, transitions and the speaker notes. */
  design: DesignCommands;
};

/** List types of slide/api.js put_ListType: bullets 0, numbering 1; subtype 1 is "•" and "1." */
const LIST_TYPE: Record<ListKind, number> = { bullet: 0, number: 1 };
const FIRST_SUBTYPE = 1;
const NO_LIST = -1;

export const readListKind = (type: number, subtype: number): ListKind | null => {
  if (subtype < 0) return null;
  if (type === LIST_TYPE.bullet) return "bullet";
  if (type === LIST_TYPE.number) return "number";
  return null;
};

export const createSlideCommands = (
  api: SlideEngineApi,
  getState: () => SlideState,
  character: CharacterCommands,
): SlideCommands => ({
  ...character,
  toggleList: (kind) => api.put_ListType(LIST_TYPE[kind], getState().list === kind ? NO_LIST : FIRST_SUBTYPE),
  addSlide: (layoutIndex) => (layoutIndex === undefined ? api.AddSlide() : api.AddSlide(layoutIndex)),
  duplicateSlide: () => api.DublicateSlide(),
  deleteSlide: () => api.DeleteSlide(),
  setLayout: (layoutIndex) => api.ChangeLayout(layoutIndex),
});

/** The engine does not report whether the notes show, so the command tells the state. */
const withNotesState = (design: DesignCommands, onNotes: (shown: boolean) => void): DesignCommands => ({
  ...design,
  showNotes: (show) => {
    design.showNotes(show);
    onNotes(show);
  },
});

/**
 * The presentation editor (slide/api.js) on top of the shared opening flow (document.ts), set up as
 * web-apps' presentationeditor/mobile does. The engine draws the slide list itself, left of the
 * slide, inside its frame.
 */
const slideBinding: EditorBinding<
  SlideWindow,
  SlideEventArgs,
  SlideEngineApi,
  SlideState,
  SlideEvent,
  Pick<
    PresentationEditor,
    "commands" | "view" | "search" | "slideShow" | "comments" | "spelling" | "onContextMenu" | "design"
  >
> = {
  format: EDITOR_FORMAT.slide,
  createApi: (win) => {
    limitSpellLanguages(win.AscCommon);
    useDedicatedSpellWorker(win);
    const api = new win.Asc.asc_docs_api({ "id-view": "editor_sdk", translate: SLIDE_TEXTS });
    api.SetFontRenderingMode(fontRenderingMode(win.devicePixelRatio));
    api.SetDrawingFreeze(true);
    api.SetThemesPath("../../../../sdkjs/slide/themes/");
    return api;
  },
  initialState: initialSlideState,
  reduce: reduceSlideState,
  events: (win) => ({
    ...textEvents(win.AscCommon),
    ...commentEvents(),
    asc_onCurrentPage: (index) => ({ type: "currentSlide", value: index }),
    asc_onUpdateLayout: (layouts) => ({
      type: "layouts",
      value: layouts.map((layout) => ({
        index: layout.getIndex(),
        name: layout.get_Name(),
        image: layout.get_Image(),
      })),
    }),
    asc_onStartDemonstration: () => ({ type: "showRunning", value: true }),
    asc_onDemonstrationSlideChanged: (index) => ({ type: "showSlide", value: index }),
    asc_onListType: (list) => ({
      type: "list",
      value: readListKind(list.get_ListType(), list.get_ListSubType()),
    }),
    asc_onInitEditorStyles: (styles) => ({ type: "themes", value: readThemes(styles) }),
    asc_onFocusObject: (objects) => ({
      type: "transition",
      value: readTransition(
        objects,
        win.Asc.c_oAscTypeSelectElement.Slide,
        win.Asc.c_oAscSlideTransitionTypes,
      ),
    }),
  }),
  setup: ({ win, api, store, dispatch, options }) => {
    const showPage = {
      element: () => win.document.getElementById(SLIDE_SHOW_ELEMENT),
      activeElement: () => win.document.activeElement,
      focus: () => win.focus(),
    };
    api.asc_registerCallback("asc_onEndDemonstration", () => {
      hideShowElement(showPage);
      dispatch({ type: "showRunning", value: false });
    });
    return {
      spelling: spellingFor(
        win,
        api,
        (listener) => api.asc_registerCallback("asc_onFocusObject", listener),
        dispatch,
        options,
      ),
      slideShow: createSlideShow(api, showPage),
      design: withNotesState(
        createDesignCommands(
          api,
          win.Asc,
          { props: () => new win.Asc.CAscSlideProps(), transition: () => new win.Asc.CAscSlideTransition() },
          () => {
            win.focus();
            api.getFocusElement().focus();
          },
        ),
        (shown) => dispatch({ type: "notes", value: shown }),
      ),
      comments: createCommentCommands(
        api,
        () => store.get().comments,
        options.user,
        () => new win.Asc.asc_CCommentData(null),
      ),
      view: createViewCommands(api),
      search: createSearchCommands(
        api,
        () => new win.AscCommon.CSearchSettings(),
        () => dispatch({ type: "searchCurrent", current: -1, total: 0 }),
      ),
      onContextMenu: contextMenuSource(api, () => win.document.getElementById("editor_sdk"), {
        thumbnails: win.Asc.c_oAscContextMenuTypes.Thumbnails,
      }),
      commands: createSlideCommands(
        api,
        store.get,
        createCharacterCommands(
          api,
          () => store.get().text,
          win.AscCommon,
          createEngineColor(win.Asc.asc_CColor),
        ),
      ),
    };
  },
  // web-apps presentationeditor/mobile Main.jsx onDocumentContentReady; spell checking as in the
  // text editor (spelling.ts).
  contentReady: (api, _win, { spellCheck }) => {
    api.SetDrawingFreeze(false);
    api.asc_setSpellCheck(spellCheck);
    // The comment marks on the slides, as web-apps shows them (presentationeditor main Main.js).
    api.asc_showComments();
    // The notes under the slide, as web-apps' desktop editor shows them unless hidden (Main.js).
    api.asc_ShowNotes(true);
    api.Resize();
    api.zoomFitToPage();
  },
  resize: (api) => {
    api.Resize();
    api.zoomFitToPage();
  },
  markUnchanged: (api) => api.SetUnchangedDocument(),
  // As slide/api.js `_downloadAs` for a PDF: every slide, not only the selected ones.
  printCommands: (api) => api.WordControl.m_oDrawingDocument.ToRendererPart(true, false),
};

/** Opens a .pptx in the presentation engine of a frame mounted with kind "slide" (see document.ts). */
export const openPresentation = (win: EngineWindow, options: OpenOptions): Promise<PresentationEditor> =>
  openDocument(win as SlideWindow, options, slideBinding);
