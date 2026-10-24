import { describe, expect, it } from "vitest";
import { createDataCommands, readFilterState, readSheetData, toFilterRequest } from "../src/cell-data";
import type { CellEngineApi, EngineAutoFilterObject, EngineCellInfo } from "../src/engine-types";

const Asc = {
  c_oAscSortOptions: { Ascending: 1, Descending: 2 },
  c_oAscSelectionSortExpand: {
    expandAndNotShowMessage: 0,
    notExpandAndNotShowMessage: 1,
    showExpandMessage: 2,
    showLockMessage: 3,
  },
  c_oAscChangeFilterOptions: { filter: 1, style: 2 },
  c_oAscFrozenPaneAddType: { firstRow: 1, firstCol: 2 },
  c_oAscAutoFilterTypes: { Filters: 4 },
  c_oAscChartTypeSettings: { barNormal: 0, hBarNormal: 16, lineNormal: 7, pie: 14, areaNormal: 22 },
  c_oAscSelectionDialogType: { Chart: 2 },
  c_oAscError: { ID: { No: 0, MaxDataSeriesError: -91, MoreOneTypeDataValidate: -96 } },
  c_oAscSelectionType: { RangeChart: 6, RangeChartText: 10 },
};

const info = (isAutoFilter: boolean | null, applied = false, table: string | null = null): EngineCellInfo =>
  ({
    asc_getAutoFilterInfo: () =>
      isAutoFilter === undefined
        ? null
        : { asc_getIsAutoFilter: () => isAutoFilter, asc_getIsApplyAutoFilter: () => applied },
    asc_getFormatTableInfo: () => (table ? { asc_getTableName: () => table } : null),
    asc_getSelectionType: () => 1,
  }) as unknown as EngineCellInfo;

/** The calls the commands make, with a cell info and frozen state to answer with. */
const recorder = (cell: EngineCellInfo, expand = 1, frozen = false) => {
  const calls: Array<[string, ...unknown[]]> = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const api = {
    asc_getCellInfo: () => cell,
    asc_sortCellsRangeExpand: () => expand,
    asc_getSheetViewSettings: () => ({ asc_getIsFreezePane: () => frozen }),
    asc_sortColFilter: record("sort"),
    asc_addAutoFilter: record("addFilter"),
    asc_changeAutoFilter: record("changeFilter"),
    asc_clearFilter: record("clearFilter"),
    asc_freezePane: record("freeze"),
    asc_applyAutoFilter: record("applyFilter"),
  } as unknown as CellEngineApi;
  return { api, calls };
};

describe("the filter state", () => {
  it("knows where filter buttons can go, are and hide rows", () => {
    expect(readFilterState(info(null))).toEqual({ available: false, on: false, applied: false });
    expect(readFilterState(info(false))).toEqual({ available: true, on: false, applied: false });
    expect(readFilterState(info(true, true))).toEqual({ available: true, on: true, applied: true });
  });

  it("is off where the engine has no filter info", () => {
    const none = { asc_getAutoFilterInfo: () => null } as unknown as EngineCellInfo;
    expect(readFilterState(none)).toEqual({ available: false, on: false, applied: false });
  });

  it("reads the frozen panes with it", () => {
    const { api } = recorder(info(false), 1, true);
    expect(readSheetData(api, info(false), Asc)).toMatchObject({ frozen: true, chart: null });
  });
});

describe("the data commands", () => {
  it("sorts the rows around a single column along, as Excel's question would by default", () => {
    for (const [expand, along] of [
      [0, true],
      [1, false],
      [2, true],
      [3, false],
    ] as const) {
      const { api, calls } = recorder(info(false), expand);
      createDataCommands(api, Asc, () => {}).sort("descending");
      expect(calls).toEqual([["sort", 2, "", undefined, undefined, along]]);
    }
  });

  it("adds filter buttons where there are none, and takes them away again", () => {
    const off = recorder(info(false));
    createDataCommands(off.api, Asc, () => {}).toggleFilter();
    expect(off.calls).toEqual([["addFilter"]]);

    const on = recorder(info(true));
    createDataCommands(on.api, Asc, () => {}).toggleFilter();
    expect(on.calls).toEqual([["changeFilter", undefined, 1, false]]);
  });

  it("switches the buttons of a formatted table by its name", () => {
    const { api, calls } = recorder(info(false, false, "Tabelle1"));
    createDataCommands(api, Asc, () => {}).toggleFilter();
    expect(calls).toEqual([["changeFilter", "Tabelle1", 1, true]]);
  });

  it("freezes at the active cell or the first row and column, and reads the state again", () => {
    const { api, calls } = recorder(info(false));
    let refreshed = 0;
    const commands = createDataCommands(api, Asc, () => {
      refreshed += 1;
    });
    commands.toggleFreeze();
    commands.freeze("firstRow");
    commands.freeze("firstColumn");
    expect(calls).toEqual([["freeze"], ["freeze", 1], ["freeze", 2]]);
    expect(refreshed).toBe(3);
  });

  it("clears the filters", () => {
    const { api, calls } = recorder(info(true, true));
    createDataCommands(api, Asc, () => {}).clearFilter();
    expect(calls).toEqual([["clearFilter"]]);
  });
});

describe("a column's filter", () => {
  const filterObject = (visible: boolean[]) => {
    const values = ["Bern", "Köln", ""].map((text, index) => ({
      text,
      visible: visible[index] ?? true,
      asc_getText() {
        return this.text;
      },
      asc_getVisible() {
        return this.visible;
      },
      asc_setVisible(value: boolean) {
        this.visible = value;
      },
    }));
    let type = 0;
    const config = {
      asc_getCellId: () => "B1",
      asc_getDisplayName: () => "",
      asc_getCellCoord: () => ({
        asc_getX: () => 100,
        asc_getY: () => 20,
        asc_getWidth: () => 64,
        asc_getHeight: () => 20,
      }),
      asc_getValues: () => values,
      asc_getSortState: () => 1,
      asc_getFilterObj: () => ({ asc_setType: (value: number) => (type = value) }),
    } as unknown as EngineAutoFilterObject;
    return { config, values, type: () => type };
  };

  it("lists the values below the button, in the frame's coordinates", () => {
    const { config } = filterObject([true, false, true]);
    const { api } = recorder(info(true));
    const request = toFilterRequest(config, api, Asc, { left: 10, top: 90 });
    expect(request).toMatchObject({
      x: 174,
      y: 130,
      sorted: "ascending",
      values: [
        { text: "Bern", visible: true },
        { text: "Köln", visible: false },
        { text: "", visible: true },
      ],
    });
  });

  it("applies the values marked visible as a list filter, but never hides everything", () => {
    const { config, values, type } = filterObject([true, true, true]);
    const { api, calls } = recorder(info(true));
    const request = toFilterRequest(config, api, Asc, { left: 0, top: 0 });
    request.apply([false, false, false]);
    expect(calls).toEqual([]);

    request.apply([false, true, true]);
    expect(values.map((value) => value.visible)).toEqual([false, true, true]);
    expect(type()).toBe(4);
    expect(calls).toEqual([["applyFilter", config]]);
  });

  it("sorts by its column", () => {
    const { config } = filterObject([]);
    const { api, calls } = recorder(info(true));
    toFilterRequest(config, api, Asc, { left: 0, top: 0 }).sort("descending");
    expect(calls).toEqual([["sort", 2, "B1", ""]]);
  });
});
