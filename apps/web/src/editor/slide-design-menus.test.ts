import { type DesignCommands, initialSlideState, type SlideState } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { designMenus, notesItem, shapeItems, themeLabel } from "./slide-design-menus";

const recording = () => {
  const calls: unknown[][] = [];
  const design: DesignCommands = {
    insertShape: (kind) => calls.push(["shape", kind]),
    setTheme: (index) => calls.push(["theme", index]),
    setTransition: (kind) => calls.push(["transition", kind]),
    applyTransitionToAll: () => calls.push(["applyToAll"]),
    showNotes: (show) => calls.push(["notes", show]),
  };
  return { calls, design };
};

const ready = (state: Partial<SlideState>): SlideState => ({
  ...initialSlideState,
  status: "ready",
  ...state,
});

describe("the presentation's design menus", () => {
  it("list the designs in German", () => {
    const { calls, design } = recording();
    const state = ready({
      themes: [
        { index: 0, name: "Blank" },
        { index: 1, name: "Green leaf" },
      ],
    });
    const [designMenu] = designMenus(state, design, false);
    const items = designMenu?.groups.flat() ?? [];
    expect(items.map((item) => item.label)).toEqual(["Leer", "Grünes Blatt"]);
    items[0]?.onSelect();
    expect(calls).toEqual([["theme", 0]]);
    expect(themeLabel("Mein Design")).toBe("Mein Design");
  });

  it("set the slide's transition and spread it, once a slide is selected", () => {
    const { calls, design } = recording();
    const [, transitions] = designMenus(ready({ transition: "fade" }), design, false);
    const items = transitions?.groups.flat() ?? [];
    expect(items.find((item) => item.checked)?.label).toBe("Verblassen");
    items.find((item) => item.label === "Zoom")?.onSelect();
    items.find((item) => item.label === "Auf alle Folien anwenden")?.onSelect();
    expect(calls).toEqual([["transition", "zoom"], ["applyToAll"]]);

    const [, none] = designMenus(ready({ transition: null }), design, false);
    expect(none?.groups.flat().every((item) => item.disabled)).toBe(true);
  });

  it("put shapes in and switch the notes", () => {
    const { calls, design } = recording();
    shapeItems(design, false)
      .find((item) => item.label === "Pfeil")
      ?.onSelect();
    notesItem(ready({ notes: true }), design, false).onSelect();
    expect(calls).toEqual([
      ["shape", "arrow"],
      ["notes", false],
    ]);
  });
});
