import { describe, expect, it } from "vitest";
import { createEngineColor } from "../src/colors";
import { clampFontSize, createTextCommands } from "../src/commands";
import type { EngineColor } from "../src/engine-types";
import { LIST_PRESETS } from "../src/lists";
import { type EditorEvent, initialEditorState, reduceEditorState } from "../src/state";
import { createFakeEngine, FakeColor } from "./fake-engine";

const setup = (state = initialEditorState) => {
  const engine = createFakeEngine();
  const api = new engine.window.Asc.asc_docs_api({});
  const commands = createTextCommands(
    api,
    () => state,
    engine.window.AscCommon,
    createEngineColor(FakeColor),
  );
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

  it("selects the whole document", () => {
    const { commands, calls } = setup();
    commands.selectAll();
    expect(lastCall(calls)).toEqual(["asc_EditSelectAll"]);
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

  const after = (...events: EditorEvent[]) => events.reduce(reduceEditorState, initialEditorState);

  it("toggles strikethrough from the current state", () => {
    const { commands, calls } = setup(after({ type: "strikeout", value: true }));
    commands.toggleStrikeout();
    expect(lastCall(calls)).toEqual(["put_TextPrStrikeout", false]);
  });

  it("sets the font and the paragraph style by name", () => {
    const { commands, calls } = setup();
    commands.setFontName("Carlito");
    expect(lastCall(calls)).toEqual(["put_TextPrFontName", "Carlito"]);
    commands.setStyle("Heading 1");
    expect(lastCall(calls)).toEqual(["put_Style", "Heading 1"]);
  });

  it("sends a colour as sRGB, and automatic as Auto", () => {
    const { commands, calls } = setup();
    const sentColor = () => lastCall(calls)?.[1] as EngineColor;
    commands.setColor("#c0392b");
    const red = sentColor();
    expect([red.asc_getR(), red.asc_getG(), red.asc_getB(), red.asc_getAuto()]).toEqual([192, 57, 43, false]);
    commands.setColor(null);
    expect(sentColor().asc_getAuto()).toBe(true);
  });

  it("starts a list, and ends it when the paragraph is in one of that kind", () => {
    const { commands, calls } = setup();
    commands.toggleList("bullet");
    expect(lastCall(calls)).toEqual(["put_ListTypeCustom", LIST_PRESETS.bullet]);

    const inList = setup(after({ type: "list", value: "bullet" }));
    inList.commands.toggleList("bullet");
    expect(lastCall(inList.calls)).toEqual(["put_ListTypeCustom", LIST_PRESETS.remove]);
    inList.commands.toggleList("number");
    expect(lastCall(inList.calls)).toEqual(["put_ListTypeCustom", LIST_PRESETS.number]);
  });
});
