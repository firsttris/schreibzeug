import { describe, expect, it } from "vitest";
import { shiftIntoView } from "./menu-bar";

describe("shiftIntoView", () => {
  it("leaves a menu that fits where it is", () => {
    expect(shiftIntoView(20, 200, 390)).toBe(0);
  });

  it("moves a menu that would run past the right edge back inside, with a margin", () => {
    // 289..497 on a 390 px screen ends at 382.
    expect(shiftIntoView(289, 208, 390)).toBe(-115);
  });

  it("does not push a menu wider than the window past the left edge", () => {
    expect(shiftIntoView(100, 500, 390)).toBe(-92);
  });
});
