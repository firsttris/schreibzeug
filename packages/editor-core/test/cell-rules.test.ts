import { describe, expect, it } from "vitest";
import { createRuleCommands, splitList } from "../src/cell-rules";
import type { CellEngineApi, EngineDataValidation } from "../src/engine-types";

const Asc = {
  c_oAscEDataValidationType: { None: 0, List: 4 },
  CDataFormula: class {
    value = "";
    asc_setValue(value: string) {
      this.value = value;
    }
  },
  c_oAscCFRuleTypeSettings: { dataBar: 1, colorScale: 2 },
  c_oAscSelectionForCFType: { selection: 1 },
  c_oAscError: { ID: { No: 0, MaxDataSeriesError: -91, MoreOneTypeDataValidate: -96 } },
};

const validation = (type = 0, list: string | null = null) => {
  const state = { type, formula: list as string | null, allowBlank: false, errors: false };
  const props: EngineDataValidation = {
    asc_getType: () => state.type,
    asc_setType: (next) => {
      state.type = next;
    },
    asc_getFormula1: () => (state.formula === null ? null : { asc_getValue: () => state.formula }),
    asc_setFormula1: (formula) => {
      state.formula = (formula as unknown as { value: string }).value;
    },
    asc_setAllowBlank: (allow) => {
      state.allowBlank = allow;
    },
    asc_setShowErrorMessage: (show) => {
      state.errors = show;
    },
  };
  return { props, state };
};

const engine = (answers: Array<EngineDataValidation | number>) => {
  const calls: unknown[][] = [];
  const api = {
    asc_getDataValidationProps: (...args: unknown[]) => {
      calls.push(["props", ...args]);
      return answers.shift() ?? null;
    },
    asc_setDataValidation: (props: EngineDataValidation) => calls.push(["set", props.asc_getType()]),
    asc_setCF: (...args: unknown[]) => calls.push(["cf", ...args]),
    asc_clearCF: (where: number) => calls.push(["clearCF", where]),
  } as unknown as CellEngineApi;
  return { api, calls };
};

describe("dropdown lists", () => {
  it("are written with the German separator and read back", () => {
    const { props, state } = validation();
    const { api, calls } = engine([props, props]);
    const rules = createRuleCommands(api, Asc);
    rules.setDropdown(["offen", " in Arbeit ", "", "erledigt"]);
    expect(state).toEqual({ type: 4, formula: "offen;in Arbeit;erledigt", allowBlank: true, errors: true });
    expect(calls.at(-1)).toEqual(["set", 4]);
    expect(rules.dropdown()).toEqual(["offen", "in Arbeit", "erledigt"]);
  });

  it("go away with an empty list", () => {
    const { props, state } = validation(4, "a;b");
    const { api } = engine([props]);
    createRuleCommands(api, Asc).setDropdown(null);
    expect(state.type).toBe(0);
  });

  it("start over where the selection holds different rules, and extend one otherwise", () => {
    const { props } = validation();
    const several = engine([-96, props]);
    createRuleCommands(several.api, Asc).setDropdown(["x"]);
    expect(several.calls.slice(0, 2)).toEqual([["props"], ["props", null]]);

    const partly = engine([-95, props]);
    createRuleCommands(partly.api, Asc).setDropdown(["x"]);
    expect(partly.calls.slice(0, 2)).toEqual([["props"], ["props", true]]);
  });

  it("read nothing where the cells have another rule", () => {
    const { props } = validation(7);
    expect(createRuleCommands(engine([props]).api, Asc).dropdown()).toBeNull();
    expect(splitList('"Ja;Nein"')).toEqual(["Ja", "Nein"]);
  });
});

describe("quick conditional formats", () => {
  it("are web-apps' first presets, and come off the selection again", () => {
    const { api, calls } = engine([]);
    const rules = createRuleCommands(api, Asc);
    rules.quickFormat("dataBar");
    rules.quickFormat("colorScale");
    rules.clearFormats();
    expect(calls).toEqual([
      ["cf", [], [], [1, 0]],
      ["cf", [], [], [2, 0]],
      ["clearCF", 1],
    ]);
  });
});
