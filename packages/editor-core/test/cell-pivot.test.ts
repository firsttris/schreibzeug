import { describe, expect, it } from "vitest";
import { createPivotCommands, newSheetName, readPivot, VALUES_FIELD, valueName } from "../src/cell-pivot";
import type { CellEngineApi, EngineCellInfo, EnginePivotTable, EnginePivotValue } from "../src/engine-types";

const Asc = {
  c_oAscDataConsolidateFunction: { Average: 1, Count: 3, Max: 4, Min: 5, Sum: 9 },
  c_oAscSelectionDialogType: { Chart: 2, PivotTableData: 6 },
  c_oAscError: { ID: { No: 0, MaxDataSeriesError: -91, MoreOneTypeDataValidate: -96, DataRangeError: -75 } },
  CT_DataField: function FakeDataField() {
    return dataValue(-1, null, null);
  } as unknown as new () => EnginePivotValue,
};

const calls: unknown[][] = [];
const record =
  (name: string) =>
  (...args: unknown[]) => {
    // The api and the table itself are left out; what is recorded are the numbers passed.
    calls.push([name, ...args.filter((arg) => typeof arg === "number")]);
  };

/** A value of the table, or a change to one, keeping what is set on it. */
function dataValue(field: number, name: string | null, subtotal: number | null): EnginePivotValue {
  const value = {
    name,
    subtotal,
    asc_getIndex: () => field,
    asc_getName: () => value.name,
    asc_getSubtotal: () => value.subtotal,
    asc_setName: (next: string) => {
      value.name = next;
    },
    asc_setSubtotal: (next: number) => {
      value.subtotal = next;
    },
    asc_set: (_api: unknown, _pivot: unknown, index: number, change: EnginePivotValue) =>
      calls.push(["set", index, change.asc_getName(), change.asc_getSubtotal()]),
  };
  return value;
}

const indexes = (values: number[]) => values.map((index) => ({ asc_getIndex: () => index }));

/** Source columns Datum, Kunde, Betrag; Kunde in the rows, Datum as a filter, "Summe von Betrag". */
const pivotTable = (
  values: EnginePivotValue[] = [dataValue(2, "Summe von Betrag", 9)],
): EnginePivotTable => ({
  asc_getCacheFields: () => ["Datum", "Kunde", "Betrag"].map((name) => ({ asc_getName: () => name })),
  asc_getPivotFields: () => [null, "", null].map((name) => ({ asc_getName: () => name })),
  asc_getRowFields: () => indexes([1]),
  asc_getColumnFields: () => indexes(values.length > 1 ? [VALUES_FIELD] : []),
  asc_getPageFields: () => indexes([0]),
  asc_getDataFields: () => values,
  asc_addField: record("addField"),
  asc_removeField: record("removeField"),
  asc_moveToRowField: record("toRows"),
  asc_moveToColField: record("toColumns"),
  asc_moveToPageField: record("toFilters"),
  asc_moveToDataField: record("toValues"),
  asc_refresh: record("refresh"),
});

const info = (pivot: EnginePivotTable | null) =>
  ({ asc_getPivotTableInfo: () => pivot }) as unknown as EngineCellInfo;

const fakeApi = (pivot: EnginePivotTable | null, range = "Preise!$A$1:$D$4", check = 0) =>
  ({
    asc_getCellInfo: () => info(pivot),
    asc_getAddPivotTableOptions: () => ({ asc_getRange: () => range }),
    asc_checkDataRange: () => check,
    asc_getWorksheetsCount: () => 2,
    asc_getWorksheetName: (index: number) => ["Preise", "Pivot1"][index],
    asc_insertPivotNewWorksheet: (source: string, name: string) => {
      calls.push(["insert", source, name]);
      return source.includes("!") ? pivot : undefined;
    },
  }) as unknown as CellEngineApi;

describe("the pivot table at the active cell", () => {
  it("lists the source's columns and what sits in each area", () => {
    expect(readPivot(info(pivotTable()), Asc)).toEqual({
      fields: [
        { index: 0, name: "Datum", used: true },
        { index: 1, name: "Kunde", used: true },
        { index: 2, name: "Betrag", used: true },
      ],
      items: [
        { field: 0, name: "Datum", area: "filters" },
        { field: 1, name: "Kunde", area: "rows" },
        { field: 2, name: "Summe von Betrag", area: "values", value: { index: 0, summary: "sum" } },
      ],
    });
  });

  it("shows the Werte entry once there are two values", () => {
    const state = readPivot(
      info(pivotTable([dataValue(2, "Summe von Betrag", 9), dataValue(1, "x", 3)])),
      Asc,
    );
    expect(state?.items.find((item) => item.area === "columns")).toEqual({
      field: VALUES_FIELD,
      name: "Werte",
      area: "columns",
    });
    expect(state?.items.at(-1)?.value).toEqual({ index: 1, summary: "count" });
  });

  it("is null outside a pivot table", () => {
    expect(readPivot(info(null), Asc)).toBeNull();
  });
});

describe("the pivot commands", () => {
  it("make a table of the range on a new sheet with a free name", () => {
    calls.length = 0;
    let changed = 0;
    const commands = createPivotCommands(fakeApi(pivotTable()), Asc, () => {
      changed += 1;
    });
    expect(commands.sourceRange()).toBe("Preise!$A$1:$D$4");
    expect(commands.insert("Preise!$A$1:$D$4")).toBeNull();
    expect(calls).toEqual([["insert", "Preise!$A$1:$D$4", "Pivot2"]]);
    expect(changed).toBe(1);
    expect(newSheetName(["Tabelle1"])).toBe("Pivot1");
  });

  it("refuse a range that is not one", () => {
    expect(createPivotCommands(fakeApi(null, "", -75), Asc, () => {}).insert("Quatsch")).toBe("invalidRange");
    expect(createPivotCommands(fakeApi(null), Asc, () => {}).insert("A1:B2")).toBe("invalidRange");
  });

  it("put fields in and out and name a new value in German", () => {
    calls.length = 0;
    const values = [dataValue(2, "Sum von Betrag", 9)];
    const commands = createPivotCommands(fakeApi(pivotTable(values)), Asc, () => {});
    commands.toggleField(2, true);
    commands.toggleField(1, false);
    expect(calls).toEqual([
      ["addField", 2],
      ["set", 0, "Summe von Betrag", null],
      ["removeField", 1],
      ["set", 0, "Summe von Betrag", null],
    ]);
  });

  it("move a field to another area, a value with its place among the values", () => {
    calls.length = 0;
    const pivot = pivotTable();
    const commands = createPivotCommands(fakeApi(pivot), Asc, () => {});
    const [filter, row, value] = readPivot(info(pivot), Asc)?.items ?? [];
    if (!filter || !row || !value) throw new Error("no items");
    commands.move(filter, "columns");
    commands.move(row, "values");
    commands.move(value, "rows");
    expect(calls).toEqual([
      ["toColumns", 0],
      ["toValues", 1],
      ["toRows", 2, 0],
    ]);
  });

  it("sum a value up another way, named after it", () => {
    calls.length = 0;
    const pivot = pivotTable();
    const commands = createPivotCommands(fakeApi(pivot), Asc, () => {});
    const value = readPivot(info(pivot), Asc)?.items.at(-1);
    if (!value) throw new Error("no value");
    commands.setSummary(value, "average");
    commands.refresh();
    expect(calls).toEqual([["set", 0, "Mittelwert von Betrag", 1], ["refresh"]]);
    expect(valueName("count", "Kunde")).toBe("Anzahl von Kunde");
  });
});
