/**
 * Shapes, text boxes, speaker notes, designs and transitions of a presentation, as web-apps'
 * editors set them (presentationeditor mobile controller/add/AddShape.jsx onShapeClick,
 * controller/edit/EditSlide.jsx onThemeClick, onEffectClick, onApplyAll, lib/editor.jsx
 * initEditorStyles; main controller/Transitions.js onEffectSelect, ViewTab.js asc_ShowNotes).
 */

/** The shapes "Einfügen" offers. */
export type ShapeKind = "textBox" | "rectangle" | "roundedRectangle" | "ellipse" | "arrow" | "line";

/** common/Drawings/Format/Constants.js: the preset geometry of each shape. */
const SHAPE_PRESETS: Record<ShapeKind, string> = {
  textBox: "textRect",
  rectangle: "rect",
  roundedRectangle: "roundRect",
  ellipse: "ellipse",
  arrow: "rightArrow",
  line: "line",
};

/** The transitions offered: web-apps' list without "Morph", which needs a matching next slide. */
export type TransitionKind =
  | "none"
  | "fade"
  | "push"
  | "wipe"
  | "split"
  | "uncover"
  | "cover"
  | "clock"
  | "zoom";

export const TRANSITION_KINDS: readonly TransitionKind[] = [
  "none",
  "fade",
  "push",
  "wipe",
  "split",
  "uncover",
  "cover",
  "clock",
  "zoom",
];

/** slide/apiDefines.js c_oAscSlideTransitionTypes. */
type TransitionTypes = {
  None: number;
  Fade: number;
  Push: number;
  Wipe: number;
  Split: number;
  UnCover: number;
  Cover: number;
  Clock: number;
  Zoom: number;
};

/** slide/apiDefines.js c_oAscSlideTransitionParams: the first option of each, as web-apps picks it. */
type TransitionParams = {
  Fade_Smoothly: number;
  Param_Left: number;
  Split_VerticalIn: number;
  Clock_Clockwise: number;
  Zoom_In: number;
};

const transitionType = (kind: TransitionKind, types: TransitionTypes): number =>
  ({
    none: types.None,
    fade: types.Fade,
    push: types.Push,
    wipe: types.Wipe,
    split: types.Split,
    uncover: types.UnCover,
    cover: types.Cover,
    clock: types.Clock,
    zoom: types.Zoom,
  })[kind];

/** EditSlide.jsx fillEffectTypes: the option a transition starts with; none has none (-1). */
const firstOption = (kind: TransitionKind, params: TransitionParams): number =>
  ({
    none: -1,
    fade: params.Fade_Smoothly,
    push: params.Param_Left,
    wipe: params.Param_Left,
    split: params.Split_VerticalIn,
    uncover: params.Param_Left,
    cover: params.Param_Left,
    clock: params.Clock_Clockwise,
    zoom: params.Zoom_In,
  })[kind];

export const transitionKindOf = (type: number | undefined, types: TransitionTypes): TransitionKind | null =>
  type === undefined ? null : (TRANSITION_KINDS.find((kind) => transitionType(kind, types) === type) ?? null);

/** slide/apiCommon.js CAscSlideTransition, the part set and read here. */
export type EngineSlideTransition = {
  put_TransitionType(type: number): void;
  put_TransitionOption(option: number): void;
  get_TransitionType(): number | undefined;
};

/** slide/apiCommon.js CAscSlideProps. */
export type EngineSlideProps = {
  put_transition(transition: EngineSlideTransition): void;
  get_transition(): EngineSlideTransition | null;
};

/** slide/apiCommon.js CAscThemeInfo: a design the editor ships with. */
export type EngineThemeInfo = { get_Index(): number; get_Name(): string };

/** slide/api.js, the calls behind these commands. */
export type DesignApi = {
  /** A shape of the preset in the middle of the slide (CPresentation.AddShapeOnCurrentPage). */
  AddShapeOnCurrentPage(preset: string): void;
  /** Loads the design with this index from the themes path and applies it to every slide. */
  ChangeTheme(index: number, selectedSlidesOnly?: boolean): void;
  /** Sets what the props hold on the selected slides. */
  SetSlideProps(props: EngineSlideProps): void;
  /** The current slide's transition on every slide. */
  SlideTransitionApplyToAll(): void;
  /** The speaker notes under the slide (HtmlPage.js ShowNotes). */
  asc_ShowNotes(show: boolean): void;
};

export type DesignConstants = {
  c_oAscSlideTransitionTypes: TransitionTypes;
  c_oAscSlideTransitionParams: TransitionParams;
};

export type DesignCommands = {
  /** A shape in the middle of the slide, selected; a text box takes the keys for its text. */
  insertShape: (kind: ShapeKind) => void;
  setTheme: (index: number) => void;
  /** The transition into the selected slides. */
  setTransition: (kind: TransitionKind) => void;
  applyTransitionToAll: () => void;
  showNotes: (show: boolean) => void;
};

/**
 * `focus` hands the keys back to the engine after a shape goes in: it is chosen from a menu outside
 * the frame, and the next thing the person does is type into it.
 */
export const createDesignCommands = (
  api: DesignApi,
  Asc: DesignConstants,
  create: { props: () => EngineSlideProps; transition: () => EngineSlideTransition },
  focus: () => void,
): DesignCommands => ({
  insertShape: (kind) => {
    api.AddShapeOnCurrentPage(SHAPE_PRESETS[kind]);
    focus();
  },
  setTheme: (index) => api.ChangeTheme(index),
  setTransition: (kind) => {
    const transition = create.transition();
    transition.put_TransitionType(transitionType(kind, Asc.c_oAscSlideTransitionTypes));
    transition.put_TransitionOption(firstOption(kind, Asc.c_oAscSlideTransitionParams));
    const props = create.props();
    props.put_transition(transition);
    api.SetSlideProps(props);
  },
  applyTransitionToAll: () => api.SlideTransitionApplyToAll(),
  showNotes: (show) => api.asc_ShowNotes(show),
});

/** A design as the menu lists it. */
export type ThemeInfo = { index: number; name: string };

/**
 * The designs the editor ships with (asc_onInitEditorStyles: [the editor's, the document's own]).
 * The document's own design is the one in use and has no index to choose it by.
 */
export const readThemes = (styles: [EngineThemeInfo[]?, EngineThemeInfo[]?]): ThemeInfo[] =>
  (styles[0] ?? []).map((theme) => ({ index: theme.get_Index(), name: theme.get_Name() }));

/** What the engine reports as selected (asc_onFocusObject), the part read here. */
type FocusObject = { asc_getObjectType(): number; get_ObjectValue?: () => unknown };

/**
 * The transition of the slide among the selected objects (Transitions.js onFocusObject: the object
 * of type Slide holds CAscSlideProps); null where no slide is among them.
 */
export const readTransition = (
  objects: readonly FocusObject[],
  slideType: number,
  types: TransitionTypes,
): TransitionKind | null => {
  const slide = objects.find((object) => object.asc_getObjectType() === slideType);
  const props = slide?.get_ObjectValue?.() as EngineSlideProps | undefined;
  return props ? transitionKindOf(props.get_transition()?.get_TransitionType(), types) : null;
};
