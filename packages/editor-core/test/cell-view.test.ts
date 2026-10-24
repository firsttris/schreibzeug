import { describe, expect, it } from "vitest";
import {
  cellPrintCommands,
  createCellSearchCommands,
  createCellViewCommands,
  toCellContextMenuRequest,
} from "../src/cell-view";
import type { CellEngineApi, CellWindow } from "../src/engine-types";

/** A spreadsheet API that records calls, with the zoom it was last set to. */
const fakeApi = (zoom = 1) => {
  const calls: unknown[][] = [];
  let current = zoom;
  /** Records a call and answers with `result`. */
  const record =
    <T>(name: string, result: T) =>
    (...args: unknown[]) => {
      calls.push([name, ...args.map((arg) => (arg as { values?: unknown })?.values ?? arg)]);
      return result;
    };
  const api = {
    asc_Copy: record("asc_Copy", true),
    asc_Cut: record("asc_Cut", true),
    asc_Paste: record("asc_Paste", false),
    asc_getZoom: () => current,
    asc_setZoom: (value: number) => {
      calls.push(["asc_setZoom", value]);
      current = value;
    },
    asc_closeCellEditor: record("asc_closeCellEditor", undefined),
    asc_findText: record("asc_findText", 2),
    asc_replaceText: (options: { values: Record<string, unknown> }) =>
      calls.push(["asc_replaceText", options.values]),
    asc_selectSearchingResults: (show: boolean) => calls.push(["asc_selectSearchingResults", show]),
    wb: {
      calcPagesPrint: () => "pages",
      printSheets: (pages: unknown) => {
        calls.push(["printSheets", pages]);
        return { DocumentRenderer: { Memory: { GetData: () => new Uint8Array([9]) } } };
      },
    },
  };
  return { api: api as unknown as CellEngineApi, calls };
};

/** cell/utils/utils.js asc_CFindOptions, recording what was set. */
const FindOptions = function FindOptions() {
  const values: Record<string, unknown> = {};
  const setter = (name: string) => (value: unknown) => {
    values[name] = value;
  };
  return {
    values,
    asc_setFindWhat: setter("findWhat"),
    asc_setScanForward: setter("scanForward"),
    asc_setIsMatchCase: setter("matchCase"),
    asc_setIsWholeCell: setter("wholeCell"),
    asc_setLookIn: setter("lookIn"),
    asc_setReplaceWith: setter("replaceWith"),
    asc_setIsReplaceAll: setter("replaceAll"),
  };
};
const win = {
  Asc: { asc_CFindOptions: FindOptions, c_oAscFindLookIn: { Formulas: 1, Value: 2 } },
} as unknown as CellWindow;

describe("spreadsheet view commands", () => {
  it("steps the zoom through fixed percentages, as a factor", () => {
    const { api, calls } = fakeApi(1);
    const view = createCellViewCommands(api);
    view.zoomIn();
    expect(calls.at(-1)).toEqual(["asc_setZoom", 1.25]);
    view.zoomOut();
    view.zoomOut();
    expect(calls.at(-1)).toEqual(["asc_setZoom", 0.75]);
    view.setZoom(150);
    expect(calls.at(-1)).toEqual(["asc_setZoom", 1.5]);
    expect(view.fitWidth).toBeNull();
  });

  it("reports when the browser refused the clipboard", () => {
    const view = createCellViewCommands(fakeApi().api);
    expect(view.clipboard("copy")).toBe(true);
    expect(view.clipboard("paste")).toBe(false);
  });
});

describe("spreadsheet search", () => {
  it("searches values in the active sheet, after closing the cell being typed into", () => {
    const { api, calls } = fakeApi();
    const search = createCellSearchCommands(api, win, () => {});
    expect(search.find({ text: "Preis", matchCase: false, wholeWords: true }, false)).toBe(2);
    expect(calls.at(-3)).toEqual(["asc_closeCellEditor"]);
    expect(calls.at(-2)).toEqual(["asc_selectSearchingResults", true]);
    expect(calls.at(-1)).toEqual([
      "asc_findText",
      { findWhat: "Preis", matchCase: false, wholeCell: true, lookIn: 2, scanForward: false },
    ]);
  });

  it("replaces one or all", () => {
    const { api, calls } = fakeApi();
    const search = createCellSearchCommands(api, win, () => {});
    search.replaceAll({ text: "alt", matchCase: true, wholeWords: false }, "neu");
    expect(calls.at(-1)).toEqual([
      "asc_replaceText",
      { findWhat: "alt", matchCase: true, wholeCell: false, lookIn: 2, replaceWith: "neu", replaceAll: true },
    ]);
  });
});

describe("spreadsheet context menu and print", () => {
  it("places the menu where the mouse was in the frame", () => {
    expect(toCellContextMenuRequest({ clientX: 40, clientY: 70 })).toEqual({ x: 40, y: 70, area: "body" });
    expect(toCellContextMenuRequest(undefined)).toBeNull();
  });

  it("draws the pages a print would have", () => {
    const { api, calls } = fakeApi();
    expect([...cellPrintCommands(api)]).toEqual([9]);
    expect(calls).toContainEqual(["printSheets", "pages"]);
  });
});
