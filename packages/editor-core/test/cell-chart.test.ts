import { describe, expect, it } from "vitest";
import { chartKindOf, createChartCommands, readSelectedChart } from "../src/cell-chart";
import type { CellEngineApi, EngineChartSettings } from "../src/engine-types";

const Asc = {
  c_oAscChartTypeSettings: { barNormal: 0, hBarNormal: 16, lineNormal: 7, pie: 14, areaNormal: 22 },
  c_oAscSelectionDialogType: { Chart: 2, PivotTableData: 6 },
  c_oAscError: { ID: { No: 0, MaxDataSeriesError: -91, MoreOneTypeDataValidate: -96, DataRangeError: -75 } },
  c_oAscSelectionType: { RangeChart: 6, RangeChartText: 10 },
};

const settings = (range: string | null, type = 0) => {
  let current = type;
  const changed: number[] = [];
  const value: EngineChartSettings = {
    getType: () => current,
    putType: (next) => {
      current = next;
    },
    getRange: () => range,
    getInColumns: () => true,
    changeType: (next) => {
      changed.push(next);
      return true;
    },
  };
  return { value, changed };
};

const engine = (chart: EngineChartSettings | null, check = 0) => {
  const calls: unknown[][] = [];
  const api = {
    asc_getChartSettings: () => chart,
    asc_checkDataRange: (...args: unknown[]) => {
      calls.push(["check", ...args]);
      return check;
    },
    asc_addChartDrawingObject: (added: EngineChartSettings) => calls.push(["add", added.getType()]),
    asc_getGraphicObjectProps: () =>
      chart ? [{ get_ObjectValue: () => ({ get_ChartProperties: () => chart }) }] : [],
  } as unknown as CellEngineApi;
  return { api, calls };
};

describe("charts", () => {
  it("make a line chart of the selection, its rows as series where the data runs down", () => {
    const { value } = settings("Tabelle1!$A$1:$B$5");
    const { api, calls } = engine(value);
    expect(createChartCommands(api, Asc).insert("line")).toBeNull();
    expect(calls).toEqual([
      ["check", 2, "Tabelle1!$A$1:$B$5", true, false, 7],
      ["add", 7],
    ]);
  });

  it("need data, and not too many series", () => {
    expect(createChartCommands(engine(settings(null).value).api, Asc).insert("pie")).toBe("noData");
    expect(createChartCommands(engine(null).api, Asc).insert("pie")).toBe("noData");
    expect(createChartCommands(engine(settings("A1:Z9").value, -91).api, Asc).insert("bar")).toBe(
      "tooManySeries",
    );
  });

  it("change the selected chart's kind and know it", () => {
    const { value, changed } = settings("A1:B5", 14);
    const { api } = engine(value);
    createChartCommands(api, Asc).changeKind("area");
    expect(changed).toEqual([22]);
    expect(readSelectedChart(api, { asc_getSelectionType: () => 6 }, Asc)).toBe("pie");
    expect(readSelectedChart(api, { asc_getSelectionType: () => 1 }, Asc)).toBeNull();
    expect(chartKindOf(99, Asc.c_oAscChartTypeSettings)).toBeNull();
  });
});
