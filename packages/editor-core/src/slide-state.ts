import {
  type CommentEvent,
  type CommentsState,
  initialCommentsState,
  isCommentEvent,
  reduceComments,
} from "./comment-state";
import { type CoreState, initialCoreState } from "./core-state";
import type { ThemeInfo, TransitionKind } from "./slide-design";
import {
  type CatalogState,
  initialTextState,
  type ListKind,
  reduceTextEvent,
  type TextEvent,
  type TextState,
} from "./state";

/** A layout of the master: what "new slide" and "layout" offer. */
export type LayoutInfo = { index: number; name: string; image: string };

/** The presentation editor's state; the number of slides is `document.pages`. */
export type SlideState = CoreState &
  CommentsState & {
    text: TextState;
    catalog: CatalogState;
    list: ListKind | null;
    /** The slide shown, from 0. */
    currentSlide: number;
    layouts: LayoutInfo[];
    /** The slide show: whether it runs, and the slide it shows, from 0. */
    show: { running: boolean; slide: number };
    /** The designs to choose from. */
    themes: ThemeInfo[];
    /** The transition into the current slide; null while no slide is selected. */
    transition: TransitionKind | null;
    /** Whether the speaker notes show under the slide; they do once the presentation opens. */
    notes: boolean;
  };

export type SlideEvent =
  | TextEvent
  | { type: "list"; value: ListKind | null }
  | { type: "currentSlide"; value: number }
  | { type: "layouts"; value: LayoutInfo[] }
  | { type: "showRunning"; value: boolean }
  | { type: "showSlide"; value: number }
  | { type: "themes"; value: ThemeInfo[] }
  | { type: "transition"; value: TransitionKind | null }
  | { type: "notes"; value: boolean }
  | CommentEvent;

export const initialSlideState: SlideState = {
  ...initialCoreState,
  text: initialTextState,
  catalog: { fonts: [], styles: [] },
  list: null,
  currentSlide: 0,
  layouts: [],
  show: { running: false, slide: 0 },
  themes: [],
  transition: null,
  notes: true,
  ...initialCommentsState,
};

export const reduceSlideState = (state: SlideState, event: SlideEvent): SlideState => {
  if (isCommentEvent(event)) return reduceComments(state, event);
  switch (event.type) {
    case "list":
      return { ...state, list: event.value };
    case "showRunning":
      return { ...state, show: { ...state.show, running: event.value } };
    case "showSlide":
      return { ...state, show: { ...state.show, slide: event.value } };
    case "currentSlide":
      return { ...state, currentSlide: event.value };
    case "layouts":
      return { ...state, layouts: event.value };
    case "themes":
      return { ...state, themes: event.value };
    case "transition":
      return { ...state, transition: event.value };
    case "notes":
      return { ...state, notes: event.value };
    default:
      return reduceTextEvent(state, event);
  }
};
