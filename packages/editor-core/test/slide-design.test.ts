import { describe, expect, it } from "vitest";
import {
  createDesignCommands,
  type DesignApi,
  type EngineSlideProps,
  type EngineSlideTransition,
  readThemes,
  readTransition,
  TRANSITION_KINDS,
} from "../src/slide-design";

const Asc = {
  c_oAscSlideTransitionTypes: {
    None: 0,
    Fade: 1,
    Push: 2,
    Wipe: 3,
    Split: 4,
    UnCover: 5,
    Cover: 6,
    Clock: 7,
    Zoom: 8,
  },
  c_oAscSlideTransitionParams: {
    Fade_Smoothly: 0,
    Param_Left: 2,
    Split_VerticalIn: 10,
    Clock_Clockwise: 14,
    Zoom_In: 17,
  },
};

const SLIDE = 7;

/** Slide props and a transition that keep what is put into them. */
const create = () => {
  const transition = { type: -2, option: -2 };
  const engineTransition: EngineSlideTransition = {
    put_TransitionType: (value) => {
      transition.type = value;
    },
    put_TransitionOption: (value) => {
      transition.option = value;
    },
    get_TransitionType: () => transition.type,
  };
  let put: EngineSlideTransition | null = null;
  const props: EngineSlideProps = {
    put_transition: (value) => {
      put = value;
    },
    get_transition: () => put,
  };
  return { transition, props, engineTransition };
};

const fakeApi = () => {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const api: DesignApi = {
    AddShapeOnCurrentPage: record("shape"),
    ChangeTheme: record("theme"),
    SetSlideProps: record("slideProps"),
    SlideTransitionApplyToAll: record("applyToAll"),
    asc_ShowNotes: record("notes"),
  };
  return { api, calls };
};

describe("the design commands", () => {
  it("put shapes in by their preset and hand the keys back", () => {
    const { api, calls } = fakeApi();
    let focused = 0;
    const commands = createDesignCommands(
      api,
      Asc,
      { props: () => create().props, transition: () => create().engineTransition },
      () => {
        focused += 1;
      },
    );
    for (const kind of ["textBox", "rectangle", "roundedRectangle", "ellipse", "arrow", "line"] as const) {
      commands.insertShape(kind);
    }
    expect(calls.map(([, preset]) => preset)).toEqual([
      "textRect",
      "rect",
      "roundRect",
      "ellipse",
      "rightArrow",
      "line",
    ]);
    expect(focused).toBe(6);
  });

  it("sets a transition with its first option, as web-apps does", () => {
    const { api, calls } = fakeApi();
    const made = create();
    const commands = createDesignCommands(
      api,
      Asc,
      { props: () => made.props, transition: () => made.engineTransition },
      () => {},
    );
    commands.setTransition("split");
    expect(made.transition).toEqual({ type: 4, option: 10 });
    expect(calls).toEqual([["slideProps", made.props]]);

    commands.setTransition("none");
    expect(made.transition).toEqual({ type: 0, option: -1 });
  });

  it("changes the design, spreads the transition and shows the notes", () => {
    const { api, calls } = fakeApi();
    const commands = createDesignCommands(
      api,
      Asc,
      { props: () => create().props, transition: () => create().engineTransition },
      () => {},
    );
    commands.setTheme(3);
    commands.applyTransitionToAll();
    commands.showNotes(true);
    expect(calls).toEqual([["theme", 3], ["applyToAll"], ["notes", true]]);
  });
});

describe("reading the presentation", () => {
  it("lists the editor's designs, not the document's own", () => {
    const theme = (index: number, name: string) => ({ get_Index: () => index, get_Name: () => name });
    expect(readThemes([[theme(0, "Blank"), theme(1, "Basic")], [theme(-1, "Eigenes")]])).toEqual([
      { index: 0, name: "Blank" },
      { index: 1, name: "Basic" },
    ]);
    expect(readThemes([])).toEqual([]);
  });

  it("knows the transition of the selected slide", () => {
    const made = create();
    made.engineTransition.put_TransitionType(Asc.c_oAscSlideTransitionTypes.Zoom);
    made.props.put_transition(made.engineTransition);
    const objects = [
      { asc_getObjectType: () => 0 },
      { asc_getObjectType: () => SLIDE, get_ObjectValue: () => made.props },
    ];
    expect(readTransition(objects, SLIDE, Asc.c_oAscSlideTransitionTypes)).toBe("zoom");
    expect(
      readTransition([{ asc_getObjectType: () => 0 }], SLIDE, Asc.c_oAscSlideTransitionTypes),
    ).toBeNull();
  });

  it("offers every kind once", () => {
    expect(new Set(TRANSITION_KINDS).size).toBe(TRANSITION_KINDS.length);
  });
});
