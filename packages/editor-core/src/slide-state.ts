import { type CoreState, initialCoreState } from "./core-state";
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
export type SlideState = CoreState & {
  text: TextState;
  catalog: CatalogState;
  list: ListKind | null;
  /** The slide shown, from 0. */
  currentSlide: number;
  layouts: LayoutInfo[];
  /** The slide show: whether it runs, and the slide it shows, from 0. */
  show: { running: boolean; slide: number };
};

export type SlideEvent =
  | TextEvent
  | { type: "list"; value: ListKind | null }
  | { type: "currentSlide"; value: number }
  | { type: "layouts"; value: LayoutInfo[] }
  | { type: "showRunning"; value: boolean }
  | { type: "showSlide"; value: number };

export const initialSlideState: SlideState = {
  ...initialCoreState,
  text: initialTextState,
  catalog: { fonts: [], styles: [] },
  list: null,
  currentSlide: 0,
  layouts: [],
  show: { running: false, slide: 0 },
};

export const reduceSlideState = (state: SlideState, event: SlideEvent): SlideState => {
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
    default:
      return reduceTextEvent(state, event);
  }
};
