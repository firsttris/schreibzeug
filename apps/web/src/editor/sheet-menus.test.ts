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
      data: { filter: { available: true, on: true, applied: false }, frozen: false },
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
    const frozen = { filter: initialSheetState.data.filter, frozen: true };
    const items = itemsOf(contextWith(data, { data: frozen }), "Ansicht");
    items.find((item) => item.label === "Fixierung aufheben")?.onSelect();
    items.find((item) => item.label === "Erste Spalte fixieren")?.onSelect();
    expect(calls).toEqual([["toggleFreeze"], ["freeze", "firstColumn"]]);
    expect(itemsOf(contextWith(data, {}), "Ansicht").map((item) => item.label)).toContain("Fenster fixieren");
  });
});
