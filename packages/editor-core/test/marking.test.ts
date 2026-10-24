import { describe, expect, it } from "vitest";
import { createMarkingCommands, readHighlight } from "../src/marking";

const recording = () => {
  const calls: unknown[][] = [];
  const commands = createMarkingCommands({
    SetMarkerFormat: (...args) => calls.push(["SetMarkerFormat", ...args]),
    SetPaintFormat: (state) => calls.push(["SetPaintFormat", state]),
  });
  return { calls, commands };
};

describe("highlight and format painter", () => {
  it("highlights the selection and leaves no highlighter mode behind", () => {
    const { calls, commands } = recording();
    commands.highlight("#ffff00");
    commands.highlight(null);
    expect(calls).toEqual([
      ["SetMarkerFormat", true, true, 255, 255, 0],
      ["SetMarkerFormat", false],
      ["SetMarkerFormat", true, false],
      ["SetMarkerFormat", false],
    ]);
  });

  it("reads the highlight at the cursor", () => {
    expect(readHighlight({ r: 0, g: 255, b: 255 })).toBe("#00ffff");
    expect(readHighlight(-1)).toBeNull();
    expect(readHighlight(null)).toBeNull();
  });

  it("turns the format painter on and off", () => {
    const { calls, commands } = recording();
    commands.togglePaintFormat(true);
    commands.togglePaintFormat(false);
    expect(calls).toEqual([
      ["SetPaintFormat", 1],
      ["SetPaintFormat", 0],
    ]);
  });
});
