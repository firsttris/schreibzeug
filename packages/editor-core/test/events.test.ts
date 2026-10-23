import { describe, expect, it } from "vitest";
import { fromAlign, stateEvents, toAlign } from "../src/events";
import { fakeColor } from "./fake-engine";

const aligns = { align_Right: 0, align_Left: 1, align_Center: 2, align_Justify: 3 };

describe("alignment", () => {
  it.each([
    [0, "right"],
    [1, "left"],
    [2, "center"],
    [3, "justify"],
  ] as const)("reads engine value %i as %s", (value, align) => {
    expect(toAlign(value, aligns)).toBe(align);
  });

  it("returns null for values sdkjs sends for a mixed selection", () => {
    expect(toAlign(-1, aligns)).toBeNull();
  });

  it.each(["left", "center", "right", "justify"] as const)("round-trips %s", (align) => {
    expect(toAlign(fromAlign(align, aligns), aligns)).toBe(align);
  });
});

describe("stateEvents", () => {
  const events = stateEvents(aligns);

  it("translates text property events", () => {
    expect(events.asc_onBold?.(true)).toEqual({ type: "bold", value: true });
    expect(events.asc_onItalic?.(false)).toEqual({ type: "italic", value: false });
    expect(events.asc_onUnderline?.(true)).toEqual({ type: "underline", value: true });
    expect(events.asc_onFontSize?.(11)).toEqual({ type: "fontSize", value: 11 });
    expect(events.asc_onPrAlign?.(2)).toEqual({ type: "align", value: "center" });
  });

  it("ignores a font size that is not a number (mixed selection)", () => {
    expect(events.asc_onFontSize?.(Number.NaN)).toBeNull();
  });

  it("reads the font name from the engine's font family object", () => {
    expect(events.asc_onFontFamily?.({ asc_getName: () => "Carlito" })).toEqual({
      type: "fontName",
      value: "Carlito",
    });
    expect(events.asc_onFontFamily?.({ asc_getName: () => "" })).toEqual({ type: "fontName", value: null });
  });

  it("translates document events", () => {
    expect(events.asc_onCanUndo?.(true)).toEqual({ type: "canUndo", value: true });
    expect(events.asc_onCanRedo?.(true)).toEqual({ type: "canRedo", value: true });
    expect(events.asc_onCountPages?.(4)).toEqual({ type: "pages", value: 4 });
  });
});

describe("stateEvents for formatting and catalogs", () => {
  const events = stateEvents(aligns);

  it("translates strikethrough and the paragraph style", () => {
    expect(events.asc_onStrikeout?.(true)).toEqual({ type: "strikeout", value: true });
    expect(events.asc_onParaStyleName?.("Heading 1")).toEqual({ type: "style", value: "Heading 1" });
    expect(events.asc_onParaStyleName?.("")).toEqual({ type: "style", value: null });
  });

  it("reads a colour as hex, and an automatic one as null", () => {
    expect(events.asc_onTextColor?.(fakeColor(31, 78, 121))).toEqual({ type: "color", value: "#1f4e79" });
    const automatic = fakeColor();
    automatic.asc_putAuto(true);
    expect(events.asc_onTextColor?.(automatic)).toEqual({ type: "color", value: null });
  });

  it("lists every font once, sorted", () => {
    const fonts = ["Carlito", "Arial", "Carlito", ""].map((name) => ({ asc_getFontName: () => name }));
    expect(events.asc_onInitEditorFonts?.(fonts)).toEqual({ type: "fonts", value: ["Arial", "Carlito"] });
  });

  it("lists the paragraph styles by name, in the engine's order", () => {
    const styles = {
      get_MergedStyles: () => ["Normal", "Heading 1", "Normal"].map((name) => ({ get_Name: () => name })),
    };
    expect(events.asc_onInitEditorStyles?.(styles)).toEqual({
      type: "styles",
      value: ["Normal", "Heading 1"],
    });
  });
});
