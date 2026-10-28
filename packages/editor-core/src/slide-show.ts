/**
 * Presenting the slides full screen, as web-apps' preview does (presentationeditor main
 * controller/Viewport.js onPreviewStart, mobile controller/Preview.jsx): the engine draws the show
 * into an element of its own page (CDemonstrationManager.Start in slide/Drawing/Transitions.js)
 * and takes the arrow keys, space and Escape there itself, while nothing in its page has focus.
 */

/** The element in the frame page the show is drawn into (engine/frame/editor/slide/main). */
export const SLIDE_SHOW_ELEMENT = "presentation-preview";

/** slide/api.js, the calls behind the slide show. */
export type SlideShowApi = {
  StartDemonstrationFromCurrentSlide(divId: string): void;
  StartDemonstrationFromBeginning(divId: string): void;
  EndDemonstration(): void;
  DemonstrationNextSlide(): void;
  DemonstrationPrevSlide(): void;
  /** The text on the black slide after the last one. */
  DemonstrationEndShowMessage(message: string): void;
};

export type SlideShow = {
  /** Starts the show; the element must already be as large as the screen it is shown on. */
  start: (from: "current" | "beginning") => void;
  end: () => void;
  next: () => void;
  previous: () => void;
};

export type ShowPage = {
  /** The element the show goes into; hidden while no show runs. */
  element: () => HTMLElement | null;
  /** The element that holds the keys in the frame, if any, so the engine's own handler gets them. */
  activeElement: () => Element | null;
  /** Gives the frame's window the keys; the show is started from a button outside it. */
  focus: () => void;
};

/** `endMessage` is shown on the black page after the last slide, in the interface's language. */
export const createSlideShow = (api: SlideShowApi, page: ShowPage, endMessage: string): SlideShow => ({
  start: (from) => {
    const element = page.element();
    if (!element) return;
    element.hidden = false;
    // The engine reads keys only while nothing in its page holds them (Transitions.js wrapKeyboard).
    page.focus();
    (page.activeElement() as HTMLElement | null)?.blur?.();
    api.DemonstrationEndShowMessage(endMessage);
    if (from === "current") api.StartDemonstrationFromCurrentSlide(SLIDE_SHOW_ELEMENT);
    else api.StartDemonstrationFromBeginning(SLIDE_SHOW_ELEMENT);
  },
  end: () => api.EndDemonstration(),
  next: () => api.DemonstrationNextSlide(),
  previous: () => api.DemonstrationPrevSlide(),
});

/** Hides the element again once the engine has ended the show (asc_onEndDemonstration). */
export const hideShowElement = (page: ShowPage): void => {
  const element = page.element();
  if (element) element.hidden = true;
};
