import { describe, expect, it } from "vitest";
import {
  createCellCommands,
  createSheetCommands,
  isValidSheetName,
  nextSheetName,
} from "../src/cell-commands";
import { NUMBER_FORMATS, readCellFormat } from "../src/cell-format";
import { initialSheetState, reduceSheetState, type SheetState } from "../src/cell-state";
import type { CellEngineApi, CellWindow, EngineCellInfo, EngineColor } from "../src/engine-types";

const aligns = { align_Right: 0, align_Left: 1, align_Center: 2, align_Justify: 3 };
const MERGE = { Disabled: -1, None: 0, Merge: 1, MergeCenter: 2 };
const Asc = {
  c_oAscMergeOptions: MERGE,
  c_oAscInsertOptions: { InsertColumns: 3, InsertRows: 4 },
  c_oAscDeleteOptions: { DeleteColumns: 3, DeleteRows: 4 },
} as unknown as CellWindow["Asc"];

const color = (r: number, g: number, b: number, auto = false): EngineColor => ({
  asc_getR: () => r,
  asc_getG: () => g,
  asc_getB: () => b,
  asc_getAuto: () => auto,
  asc_putAuto: () => {},
});

const cellInfo = (
  overrides: Partial<Record<string, unknown>> = {},
  merge = MERGE.Disabled,
): EngineCellInfo => {
  const values: Record<string, unknown> = {
    asc_getFontName: "Calibri",
    asc_getFontSize: 11,
    asc_getFontColor: color(0, 0, 0, true),
    asc_getFontBold: true,
    asc_getFontItalic: false,
    asc_getFontUnderline: false,
    asc_getFontStrikeout: false,
    asc_getFillColor: color(255, 255, 0),
    asc_getHorAlign: aligns.align_Center,
    asc_getWrapText: true,
    asc_getNumFormat: "0.00%",
    ...overrides,
  };
  const xfs = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, () => value]));
  return {
    asc_getXfs: () => xfs as never,
    asc_getMerge: () => merge,
    asc_getAutoFilterInfo: () => null,
    asc_getFormatTableInfo: () => null,
  };
};

describe("readCellFormat", () => {
  it("reads font, colours, alignment, wrap and the number format of the active cell", () => {
    expect(readCellFormat(cellInfo(), aligns, MERGE)).toEqual({
      bold: true,
      italic: false,
      underline: false,
      strikeout: false,
      fontName: "Calibri",
      fontSize: 11,
      color: null,
      fill: "#ffff00",
      align: "center",
      wrap: true,
      numberFormat: "percent",
      merged: false,
      mergeable: false,
    });
  });

  it("calls a format it does not offer custom, and knows merged ranges", () => {
    const format = readCellFormat(cellInfo({ asc_getNumFormat: "0.000" }), aligns, MERGE);
    expect(format.numberFormat).toBe("custom");
    expect(readCellFormat(cellInfo({}, MERGE.Merge), aligns, MERGE)).toMatchObject({
      merged: true,
      mergeable: true,
    });
    expect(readCellFormat(cellInfo({}, MERGE.None), aligns, MERGE)).toMatchObject({
      merged: false,
      mergeable: true,
    });
  });
});

const fakeApi = () => {
  const calls: unknown[][] = [];
  const api = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args]);
          return name === "asc_deleteWorksheet" ? true : undefined;
        },
    },
  ) as CellEngineApi;
  return { api, calls };
};

const stateWith = (patch: Partial<SheetState>): SheetState => ({ ...initialSheetState, ...patch });

describe("createCellCommands", () => {
  const setup = (state: SheetState) => {
    const { api, calls } = fakeApi();
    const commands = createCellCommands(
      api,
      () => state,
      { aligns, Asc },
      (value) => (value === null ? color(0, 0, 0, true) : color(1, 2, 3)),
    );
    return { commands, calls };
  };

  it("toggles from the state, as the engine takes the target value", () => {
    const { commands, calls } = setup(stateWith({ cell: { ...initialSheetState.cell, bold: true } }));
    commands.toggleBold();
    commands.toggleItalic();
    expect(calls).toEqual([
      ["asc_setCellBold", false],
      ["asc_setCellItalic", true],
    ]);
  });

  it("sets formats, alignment, fills and sizes within the engine's limits", () => {
    const { commands, calls } = setup(initialSheetState);
    commands.setNumberFormat("currency");
    commands.setAlign("right");
    commands.setFill(null);
    commands.setFontSize(500);
    expect(calls).toEqual([
      ["asc_setCellFormat", NUMBER_FORMATS.currency],
      ["asc_setCellAlign", aligns.align_Right],
      ["asc_setCellBackgroundColor", null],
      ["asc_setCellFontSize", 409],
    ]);
  });

  it("merges, or splits what is merged, and inserts and deletes rows and columns", () => {
    const merged = setup(stateWith({ cell: { ...initialSheetState.cell, merged: true } }));
    merged.commands.toggleMerge();
    const plain = setup(initialSheetState);
    plain.commands.toggleMerge();
    plain.commands.insertRows();
    plain.commands.deleteColumns();
    expect(merged.calls).toEqual([["asc_mergeCells", MERGE.None]]);
    expect(plain.calls).toEqual([
      ["asc_mergeCells", MERGE.Merge],
      ["asc_insertCells", 4],
      ["asc_deleteCells", 3],
    ]);
  });
});

describe("sheets", () => {
  const sheets = (names: string[], hidden: string[] = []) =>
    names.map((name, index) => ({ id: String(index), name, hidden: hidden.includes(name) }));

  it("names a new sheet with the first free number", () => {
    expect(nextSheetName([])).toBe("Tabelle1");
    expect(nextSheetName(["Tabelle1", "tabelle2", "Daten"])).toBe("Tabelle3");
  });

  it("accepts only names Excel allows and nobody else has", () => {
    expect(isValidSheetName("Ausgaben", ["Tabelle1"])).toBe(true);
    expect(isValidSheetName(" ", [])).toBe(false);
    expect(isValidSheetName("Q1/Q2", [])).toBe(false);
    expect(isValidSheetName("'Zitat", [])).toBe(false);
    expect(isValidSheetName("x".repeat(32), [])).toBe(false);
    expect(isValidSheetName("tabelle1", ["Tabelle1"])).toBe(false);
  });

  it("adds, renames and refuses to delete the last visible sheet", () => {
    const { api, calls } = fakeApi();
    const state = stateWith({ sheets: sheets(["Tabelle1", "Versteckt"], ["Versteckt"]), activeSheet: 0 });
    const commands = createSheetCommands(api, () => state);
    commands.add();
    expect(commands.rename("Versteckt")).toBe(false);
    expect(commands.rename("Ausgaben")).toBe(true);
    expect(commands.remove()).toBe(false);
    expect(calls).toEqual([
      ["asc_closeCellEditor"],
      ["asc_addWorksheet", "Tabelle2"],
      ["asc_renameWorksheet", "Ausgaben"],
    ]);
  });
});

describe("reduceSheetState", () => {
  it("keeps the sheets, the active one and the reference", () => {
    const tabs = [{ id: "1", name: "A", hidden: false }];
    const state = reduceSheetState(
      reduceSheetState(initialSheetState, { type: "sheets", sheets: tabs, active: 0 }),
      {
        type: "reference",
        value: "B2",
      },
    );
    expect(state).toMatchObject({ sheets: tabs, activeSheet: 0, reference: "B2" });
  });
});
