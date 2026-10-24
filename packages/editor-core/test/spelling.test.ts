import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { limitSpellLanguages, onlyShipped, SPELL_LANGUAGES } from "../src/spelling";

const ENGINE_SPEC = join(import.meta.dirname, "../../../engine/engine.json");

describe("the spell checker's languages", () => {
  it("are the dictionaries the engine is prepared with", () => {
    const spec = JSON.parse(readFileSync(ENGINE_SPEC, "utf8")) as { dictionaries: string[] };
    expect([...SPELL_LANGUAGES].sort()).toEqual([...spec.dictionaries].sort());
  });

  it("leave out every language without its dictionary, which would mark every word", () => {
    const all = {
      "1031": { name: "de_DE", hyphen: true },
      "1033": { name: "en_US", hyphen: true },
      "1036": { name: "fr_FR", hyphen: true },
    };
    expect(Object.keys(onlyShipped(all))).toEqual(["1031", "1033"]);

    const common = { spellcheckGetLanguages: () => all };
    limitSpellLanguages(common);
    expect(Object.keys(common.spellcheckGetLanguages())).toEqual(["1031", "1033"]);
  });

  it("leave an engine without the list as it is", () => {
    const common = {};
    expect(() => limitSpellLanguages(common)).not.toThrow();
  });
});
