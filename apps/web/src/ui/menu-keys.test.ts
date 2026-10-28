import { describe, expect, it } from "vitest";
import { nextIndex } from "./menu-keys";

describe("nextIndex", () => {
  it("goes down and up a menu, around at the ends", () => {
    expect(nextIndex("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(nextIndex("ArrowDown", 2, 3, "vertical")).toBe(0);
    expect(nextIndex("ArrowUp", 0, 3, "vertical")).toBe(2);
  });

  it("starts at the first entry when none has the focus yet", () => {
    expect(nextIndex("ArrowDown", -1, 3, "vertical")).toBe(0);
  });

  it("goes left and right along a menu bar", () => {
    expect(nextIndex("ArrowRight", 1, 4, "horizontal")).toBe(2);
    expect(nextIndex("ArrowLeft", 0, 4, "horizontal")).toBe(3);
    expect(nextIndex("ArrowDown", 0, 4, "horizontal")).toBeNull();
  });

  it("jumps to the first and last entry with Home and End", () => {
    expect(nextIndex("Home", 2, 4, "vertical")).toBe(0);
    expect(nextIndex("End", 0, 4, "horizontal")).toBe(3);
  });

  it("leaves other keys and empty menus alone", () => {
    expect(nextIndex("a", 0, 3, "vertical")).toBeNull();
    expect(nextIndex("ArrowDown", 0, 0, "vertical")).toBeNull();
  });
});
