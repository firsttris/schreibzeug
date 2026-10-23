import { describe, expect, it } from "vitest";
import { clampFontSize, createTextCommands } from "../src/commands";
import { initialEditorState, reduceEditorState } from "../src/state";
import { createFakeEngine } from "./fake-engine";

const setup = (state = initialEditorState) => {
  const engine = createFakeEngine();
  const api = new engine.window.Asc.asc_docs_api({});
  const commands = createTextCommands(api, () => state, engine.window.AscCommon);
  return { commands, calls: engine.api().calls };
};

const lastCall = (calls: Array<[string, ...unknown[]]>) => calls.at(-1);

describe("createTextCommands", () => {
  it("turns bold on when the selection is not bold", () => {
    const { commands, calls } = setup();
    commands.toggleBold();
    expect(lastCall(calls)).toEqual(["put_TextPrBold", true]);
  });

  it("turns bold off when the selection is bold", () => {
    const { commands, calls } = setup(reduceEditorState(initialEditorState, { type: "bold", value: true }));
    commands.toggleBold();
    expect(lastCall(calls)).toEqual(["put_TextPrBold", false]);
  });

  it("toggles italic and underline from the current state", () => {
    const { commands, calls } = setup();
    commands.toggleItalic();
    expect(lastCall(calls)).toEqual(["put_TextPrItalic", true]);
    commands.toggleUnderline();
    expect(lastCall(calls)).toEqual(["put_TextPrUnderline", true]);
  });

  it("sends alignment as the engine's constant", () => {
    const { commands, calls } = setup();
    commands.setAlign("center");
    expect(lastCall(calls)).toEqual(["put_PrAlign", 2]);
  });

  it("passes undo and redo through", () => {
    const { commands, calls } = setup();
    commands.undo();
    commands.redo();
    expect(calls.slice(-2)).toEqual([["Undo"], ["Redo"]]);
  });

  it("clamps the font size to what the engine accepts", () => {
    const { commands, calls } = setup();
    commands.setFontSize(999);
    expect(lastCall(calls)).toEqual(["put_TextPrFontSize", 300]);
  });
});

describe("clampFontSize", () => {
  it.each([
    [0, 1],
    [11, 11],
    [10.3, 10.5],
    [12.74, 12.5],
    [301, 300],
  ])("clamps %d to %d", (input, expected) => {
    expect(clampFontSize(input)).toBe(expected);
  });
});
