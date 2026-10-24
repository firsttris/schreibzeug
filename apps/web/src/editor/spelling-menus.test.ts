import type { SpellingCommands } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { spellCheckItem, suggestionGroups } from "./spelling-menus";

const recording = () => {
  const calls: unknown[][] = [];
  const commands: SpellingCommands = {
    setEnabled: (on) => calls.push(["enabled", on]),
    replace: (word) => calls.push(["replace", word]),
    ignore: (everywhere) => calls.push(["ignore", everywhere]),
  };
  return { calls, commands };
};

describe("spelling in the menus", () => {
  it("lists at most five suggestions, then ignoring", () => {
    const { calls, commands } = recording();
    const misspelled = { word: "Angbot", suggestions: ["Angebot", "Anbot", "a", "b", "c", "d"] };
    const groups = suggestionGroups({ enabled: true, misspelled }, commands);
    expect(groups.map((group) => group.map((item) => item.label))).toEqual([
      ["Angebot", "Anbot", "a", "b", "c"],
      ["Ignorieren", "Alle ignorieren"],
    ]);
    groups[0]?.[0]?.onSelect();
    groups[1]?.[1]?.onSelect();
    expect(calls).toEqual([
      ["replace", "Angebot"],
      ["ignore", true],
    ]);
  });

  it("says when there is nothing to suggest, and shows nothing for a correct word", () => {
    const { commands } = recording();
    const none = suggestionGroups({ enabled: true, misspelled: { word: "Xq", suggestions: [] } }, commands);
    expect(none[0]?.[0]).toMatchObject({ label: "Keine Vorschläge", disabled: true });
    expect(suggestionGroups({ enabled: true, misspelled: null }, commands)).toEqual([]);
    expect(
      suggestionGroups({ enabled: false, misspelled: { word: "Xq", suggestions: [] } }, commands),
    ).toEqual([]);
  });

  it("switches the underlines", () => {
    const { calls, commands } = recording();
    spellCheckItem({ enabled: true, misspelled: null }, commands, false).onSelect();
    expect(calls).toEqual([["enabled", false]]);
  });
});
