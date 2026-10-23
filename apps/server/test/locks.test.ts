import { describe, expect, it } from "vitest";
import { acquireLocks, EDITOR_TYPE, type Locks, locksForAuth } from "../src/collab/locks";

const NOW = 1_800_000_000_000;
const owners = (locks: Locks) =>
  Object.fromEntries(Object.entries(locks).map(([key, lock]) => [key, lock.user]));

describe("text documents", () => {
  it("grant every new block and keep the holder of one already taken", () => {
    const anna = acquireLocks({}, ["p1"], "anna", NOW, EDITOR_TYPE.document);
    const both = acquireLocks(anna, ["p1", "p2"], "ben", NOW, EDITOR_TYPE.document);
    expect(owners(both)).toEqual({ p1: "anna", p2: "ben" });
  });
});

describe("spreadsheets", () => {
  const range = (guid: string, c1: number, r1: number, c2 = c1, r2 = r1, sheetId = "s1") => ({
    guid,
    sheetId,
    type: 1,
    subType: null,
    rangeOrObjectId: { c1, r1, c2, r2 },
  });
  const sheet = EDITOR_TYPE.spreadsheet;

  it("grant blocks nobody holds without comparing ranges, as the Document Server does", () => {
    const anna = acquireLocks({}, [range("a", 0, 0, 3, 3)], "anna", NOW, sheet);
    expect(owners(acquireLocks(anna, [range("b", 1, 1)], "ben", NOW, sheet))).toEqual({
      a: "anna",
      b: "ben",
    });
  });

  it("take nothing back when an asked-for block is held and the ranges overlap", () => {
    const held = acquireLocks({}, [range("a", 0, 0, 3, 3)], "anna", NOW, sheet);
    // Ben asks for Anna's block again together with an overlapping one: he gets neither.
    const after = acquireLocks(held, [range("a", 0, 0, 3, 3), range("b", 2, 2)], "ben", NOW, sheet);
    expect(owners(after)).toEqual({ a: "anna" });
  });

  it("let a block through when the only overlap is on another sheet", () => {
    const anna = acquireLocks({}, [range("a", 0, 0, 3, 3)], "anna", NOW, sheet);
    const ben = acquireLocks(anna, [range("b1", 9, 9)], "ben", NOW, sheet);
    // Ben asks again for his own block, plus one where Anna's range is, but on another sheet.
    const asked = [range("b1", 9, 9), range("b2", 2, 2, 2, 2, "s2")];
    expect(owners(acquireLocks(ben, asked, "ben", NOW, sheet))).toEqual({ a: "anna", b1: "ben", b2: "ben" });
  });

  it("refuse when the overlap is on the same sheet", () => {
    const anna = acquireLocks({}, [range("a", 0, 0, 3, 3)], "anna", NOW, sheet);
    const ben = acquireLocks(anna, [range("b1", 9, 9)], "ben", NOW, sheet);
    const asked = [range("b1", 9, 9), range("b2", 2, 2)];
    expect(owners(acquireLocks(ben, asked, "ben", NOW, sheet))).toEqual({ a: "anna", b1: "ben" });
  });

  it("hand the locks to auth as a list", () => {
    const held = acquireLocks({}, [range("a", 0, 0)], "anna", NOW, sheet);
    expect(locksForAuth(held, sheet)).toEqual([held.a]);
    expect(locksForAuth(held, EDITOR_TYPE.document)).toBe(held);
  });
});

describe("presentations", () => {
  const slide = (guid: string, val: string) => ({ guid, type: 2, val });
  const object = (guid: string, slideId: string, objId: string) => ({ guid, type: 1, slideId, objId });
  const deck = EDITOR_TYPE.presentation;

  it("refuse an object on a slide someone else holds when a block was already taken", () => {
    const held = acquireLocks({}, [slide("s", "slide1")], "anna", NOW, deck);
    const after = acquireLocks(
      held,
      [slide("s", "slide1"), object("o", "slide1", "shape1")],
      "ben",
      NOW,
      deck,
    );
    expect(owners(after)).toEqual({ s: "anna" });
  });

  it("allow objects on another slide", () => {
    const anna = acquireLocks({}, [slide("s", "slide1")], "anna", NOW, deck);
    const ben = acquireLocks(anna, [object("o1", "slide2", "shape1")], "ben", NOW, deck);
    const asked = [object("o1", "slide2", "shape1"), object("o2", "slide2", "shape2")];
    expect(owners(acquireLocks(ben, asked, "ben", NOW, deck))).toEqual({ s: "anna", o1: "ben", o2: "ben" });
  });
});
