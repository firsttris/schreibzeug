import { describe, expect, it } from "vitest";
import type { CharacterCommands } from "../src/commands";
import type { SlideEngineApi } from "../src/engine-types";
import { createSlideCommands, readListKind } from "../src/slide";
import { initialSlideState, reduceSlideState, type SlideEvent, type SlideState } from "../src/slide-state";

const fakeApi = () => {
  const calls: unknown[][] = [];
  const api = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args]);
        },
    },
  ) as SlideEngineApi;
  return { api, calls };
};

const character = {} as CharacterCommands;

describe("slide commands", () => {
  it("starts and ends lists as slide/api.js put_ListType takes them", () => {
    const { api, calls } = fakeApi();
    let state: SlideState = initialSlideState;
    const commands = createSlideCommands(api, () => state, character);
    commands.toggleList("bullet");
    state = { ...state, list: "bullet" };
    commands.toggleList("bullet");
    commands.toggleList("number");
    expect(calls).toEqual([
      ["put_ListType", 0, 1],
      ["put_ListType", 0, -1],
      ["put_ListType", 1, 1],
    ]);
  });

  it("adds, copies, deletes slides and changes the layout", () => {
    const { api, calls } = fakeApi();
    const commands = createSlideCommands(api, () => initialSlideState, character);
    commands.addSlide();
    commands.addSlide(1);
    commands.duplicateSlide();
    commands.deleteSlide();
    commands.setLayout(3);
    expect(calls).toEqual([
      ["AddSlide"],
      ["AddSlide", 1],
      ["DublicateSlide"],
      ["DeleteSlide"],
      ["ChangeLayout", 3],
    ]);
  });
});

describe("readListKind", () => {
  it("reads the list the engine reports at the cursor", () => {
    expect(readListKind(0, 1)).toBe("bullet");
    expect(readListKind(1, 3)).toBe("number");
    expect(readListKind(0, -1)).toBeNull();
    expect(readListKind(-1, 0)).toBeNull();
  });
});

describe("reduceSlideState", () => {
  it("keeps the slide shown, the layouts and the text at the cursor", () => {
    const layouts = [{ index: 0, name: "Titelfolie", image: "data:," }];
    const events: SlideEvent[] = [
      { type: "currentSlide", value: 2 },
      { type: "layouts", value: layouts },
      { type: "bold", value: true },
      { type: "fonts", value: ["Carlito"] },
    ];
    const state = events.reduce(reduceSlideState, initialSlideState);
    expect(state).toMatchObject({
      currentSlide: 2,
      layouts,
      text: { bold: true },
      catalog: { fonts: ["Carlito"] },
    });
  });
});

describe("slide comments in the state", () => {
  it("keeps the comments the engine reports and the one that is open", () => {
    const comment = {
      id: "c1",
      authorId: "u1",
      author: "Tristan",
      text: "Folie kürzen",
      time: 1,
      quote: null,
      resolved: false,
      guid: "g1",
      replies: [],
    };
    const events: SlideEvent[] = [
      { type: "commentSet", comment },
      { type: "activeComments", ids: ["c1"] },
      { type: "commentSet", comment: { ...comment, resolved: true } },
    ];
    const state = events.reduce(reduceSlideState, initialSlideState);
    expect(state.comments).toEqual([{ ...comment, resolved: true }]);
    expect(state.activeComments).toEqual(["c1"]);
    expect(reduceSlideState(state, { type: "commentRemoved", id: "c1" })).toMatchObject({
      comments: [],
      activeComments: [],
    });
  });
});
