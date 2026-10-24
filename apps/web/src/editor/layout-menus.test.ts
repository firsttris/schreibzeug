import type { LayoutCommands, PageLayout } from "@stapel/editor-core";
import { describe, expect, it } from "vitest";
import { formatSpacing, layoutMenu, lineSpacingItems } from "./layout-menus";

const landscapeA5: PageLayout = {
  width: 210,
  height: 148,
  portrait: false,
  margins: { top: 12.7, left: 12.7, bottom: 12.7, right: 12.7 },
};

const recording = () => {
  const calls: unknown[][] = [];
  const layout: LayoutCommands = {
    setOrientation: (portrait) => calls.push(["orientation", portrait]),
    setPaperSize: (size) => calls.push(["size", size.id]),
    setMargins: (margins) => calls.push(["margins", margins]),
    setLineSpacing: (multiple) => calls.push(["lineSpacing", multiple]),
    indent: (direction) => calls.push(["indent", direction]),
  };
  return { calls, layout };
};

describe("layout menu", () => {
  it("checks what the page has", () => {
    const checked = layoutMenu(landscapeA5, recording().layout, false)
      .groups.flat()
      .filter((item) => item.checked)
      .map((item) => item.label);
    expect(checked).toEqual(["Querformat", "A5", "Ränder schmal"]);
  });

  it("is off while the page is unknown", () => {
    expect(
      layoutMenu(null, recording().layout, false)
        .groups.flat()
        .every((item) => item.disabled),
    ).toBe(true);
  });

  it("sets the paper size and the line spacing", () => {
    const { calls, layout } = recording();
    layoutMenu(landscapeA5, layout, false)
      .groups.flat()
      .find((item) => item.label === "Letter")
      ?.onSelect();
    lineSpacingItems(1.15, layout, false)
      .find((item) => item.label === "Zeilenabstand 1,5")
      ?.onSelect();
    expect(calls).toEqual([
      ["size", "Letter"],
      ["lineSpacing", 1.5],
    ]);
  });

  it("writes spacings with a German decimal comma", () => {
    expect([1, 1.15, 2].map(formatSpacing)).toEqual(["1,0", "1,15", "2,0"]);
  });
});
