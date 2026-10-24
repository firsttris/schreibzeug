import { describe, expect, it } from "vitest";
import { initialCoreState, reduceCore } from "../src/core-state";
import { stateEvents } from "../src/events";
import { createSearchCommands } from "../src/search";
import { findShortcutOf } from "../src/view";
import { createFakeEngine } from "./fake-engine";

const setup = () => {
  const engine = createFakeEngine();
  const api = new engine.window.Asc.asc_docs_api({});
  const reports: string[] = [];
  return {
    search: createSearchCommands(
      api,
      () => new engine.window.AscCommon.CSearchSettings(),
      () => reports.push("none"),
    ),
    calls: engine.api().calls,
    reports,
  };
};

const query = { text: "Stapel", matchCase: true, wholeWords: false };

describe("search commands", () => {
  it("finds forward and back with the settings web-apps fills", () => {
    const { search, calls } = setup();
    expect(search.find(query, true)).toBe(3);
    expect(calls.at(-1)).toEqual([
      "asc_findText",
      { text: "Stapel", matchCase: true, wholeWords: false },
      true,
    ]);
    search.find(query, false);
    expect(calls.at(-1)?.[2]).toBe(false);
  });

  it("does not ask the engine about an empty text, and says there is nothing", () => {
    const { search, calls, reports } = setup();
    expect(search.find({ ...query, text: "" }, true)).toBe(0);
    expect(search.replace({ ...query, text: "" }, "x")).toBe(false);
    expect(calls.some(([name]) => name === "asc_findText" || name === "asc_replaceText")).toBe(false);
    expect(reports).toEqual(["none"]);
  });

  it("replaces one or all", () => {
    const { search, calls } = setup();
    expect(search.replace(query, "Ordner")).toBe(true);
    expect(calls.at(-1)?.slice(2)).toEqual(["Ordner", false]);
    search.replaceAll(query, "Ordner");
    expect(calls.at(-1)?.slice(2)).toEqual(["Ordner", true]);
    search.end();
    expect(calls.at(-1)).toEqual(["asc_endFindText"]);
  });
});

describe("search state", () => {
  const constants = {
    align_Right: 0,
    align_Left: 1,
    align_Center: 2,
    align_Justify: 3,
    vertalign_Baseline: 0,
    vertalign_SubScript: 1,
    vertalign_SuperScript: 2,
  };
  const events = stateEvents(constants, 20);

  it("follows the selected match and the count, and how many were replaced", () => {
    const found = events.asc_onSetSearchCurrent?.(1, 4);
    expect(found).toEqual({ type: "searchCurrent", current: 1, total: 4 });
    const state = reduceCore(initialCoreState, found as never);
    expect(state.search).toEqual({ current: 1, total: 4, replaced: null });
    const replaced = reduceCore(state, events.asc_onReplaceAll?.(4, 4) as never);
    expect(replaced.search).toEqual({ current: -1, total: 0, replaced: 4 });
  });
});

describe("findShortcutOf", () => {
  const key = (
    k: string,
    extra: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
  ) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extra,
  });

  it("knows Strg+F and Strg+H, also with Cmd", () => {
    expect(findShortcutOf(key("f", { ctrlKey: true }))).toBe("find");
    expect(findShortcutOf(key("H", { metaKey: true }))).toBe("replace");
    expect(findShortcutOf(key("f"))).toBeNull();
    expect(findShortcutOf(key("f", { ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});
