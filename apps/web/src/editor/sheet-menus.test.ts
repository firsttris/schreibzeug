import { type DataCommands, initialSheetState, type SheetState } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { type SheetMenuContext, sheetMenus } from "./sheet-menus";

const recording = () => {
  const calls: unknown[][] = [];
  const data: DataCommands = {
    sort: (order) => calls.push(["sort", order]),
    toggleFilter: () => calls.push(["toggleFilter"]),
    clearFilter: () => calls.push(["clearFilter"]),
    toggleFreeze: () => calls.push(["toggleFreeze"]),
    freeze: (kind) => calls.push(["freeze", kind]),
  };
  return { calls, data };
};

const contextWith = (data: DataCommands, state: Partial<SheetState>): SheetMenuContext => ({
  state: { ...initialSheetState, status: "ready", ...state },
  commands: {} as SheetMenuContext["commands"],
  sheets: null,
  data,
  charts: null,
  onChartFailure: () => {},
  view: null,
  onClipboardRefused: () => {},
  onFind: () => {},
  onInsertImage: null,
  onAddComment: () => {},
});

const itemsOf = (context: SheetMenuContext, menu: string) =>
  sheetMenus(context)
    .find((entry) => entry.label === menu)
    ?.groups.flat() ?? [];

describe("the spreadsheet's Daten menu", () => {
  it("sorts and switches the filter where the engine allows one", () => {
    const { calls, data } = recording();
    const context = contextWith(data, {
      data: { filter: { available: true, on: true, applied: false }, frozen: false, chart: null },
    });
    const items = itemsOf(context, "Daten");
    for (const item of items) if (!item.disabled) item.onSelect();
    expect(calls).toEqual([["sort", "ascending"], ["sort", "descending"], ["toggleFilter"]]);
    expect(items.find((item) => item.label === "Filter")?.checked).toBe(true);
    expect(items.find((item) => item.label === "Filter löschen")?.disabled).toBe(true);
  });

  it("offers no filter where there is no data", () => {
    const items = itemsOf(contextWith(recording().data, {}), "Daten");
    expect(items.find((item) => item.label === "Filter")?.disabled).toBe(true);
  });
});

describe("freezing in the Ansicht menu", () => {
  it("unfreezes what is frozen, with the words of Excel", () => {
    const { calls, data } = recording();
    const frozen = { filter: initialSheetState.data.filter, frozen: true, chart: null };
    const items = itemsOf(contextWith(data, { data: frozen }), "Ansicht");
    items.find((item) => item.label === "Fixierung aufheben")?.onSelect();
    items.find((item) => item.label === "Erste Spalte fixieren")?.onSelect();
    expect(calls).toEqual([["toggleFreeze"], ["freeze", "firstColumn"]]);
    expect(itemsOf(contextWith(data, {}), "Ansicht").map((item) => item.label)).toContain("Fenster fixieren");
  });
});

describe("charts in the Einfügen menu", () => {
  const charts = (failure: "noData" | null = null) => {
    const calls: unknown[][] = [];
    return {
      calls,
      commands: {
        insert: (kind: string) => {
          calls.push(["insert", kind]);
          return failure;
        },
        changeKind: (kind: string) => calls.push(["change", kind]),
      },
    };
  };

  it("makes a chart of the selection and says why when it cannot", () => {
    const { calls, commands } = charts("noData");
    const failures: string[] = [];
    const context = {
      ...contextWith(recording().data, {}),
      charts: commands,
      onChartFailure: (failure: string) => failures.push(failure),
    };
    itemsOf(context, "Einfügen")
      .find((item) => item.label === "Diagramm: Linien")
      ?.onSelect();
    expect(calls).toEqual([["insert", "line"]]);
    expect(failures).toEqual(["noData"]);
  });

  it("changes the selected chart's kind and checks the one it has", () => {
    const { calls, commands } = charts();
    const data = { ...initialSheetState.data, chart: "pie" as const };
    const items = itemsOf({ ...contextWith(recording().data, { data }), charts: commands }, "Einfügen");
    expect(items.filter((item) => item.checked).map((item) => item.label)).toEqual(["Diagramm: Kreis"]);
    items.find((item) => item.label === "Diagramm: Säulen")?.onSelect();
    expect(calls).toEqual([["change", "column"]]);
  });
});
