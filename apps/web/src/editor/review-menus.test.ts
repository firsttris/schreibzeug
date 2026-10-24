import type { ReviewCommands } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { reviewMenu } from "./review-menus";

const recording = () => {
  const calls: unknown[][] = [];
  const review: ReviewCommands = {
    setTracking: (on) => calls.push(["tracking", on]),
    setDisplay: (display) => calls.push(["display", display]),
    next: () => calls.push(["next"]),
    previous: () => calls.push(["previous"]),
    accept: () => calls.push(["accept"]),
    reject: () => calls.push(["reject"]),
    acceptAll: () => calls.push(["acceptAll"]),
    rejectAll: () => calls.push(["rejectAll"]),
  };
  return { calls, review };
};

const state = { tracking: true, display: "final" as const, atCursor: [] };

describe("the Überprüfen menu", () => {
  it("switches tracking off when it is on, and checks the display shown", () => {
    const { calls, review } = recording();
    const items = reviewMenu(state, review, false).groups.flat();
    items.find((item) => item.label === "Änderungen nachverfolgen")?.onSelect();
    expect(calls).toEqual([["tracking", false]]);
    expect(items.filter((item) => item.checked).map((item) => item.label)).toEqual([
      "Änderungen nachverfolgen",
      "Anzeige: Endgültig",
    ]);
  });

  it("accepts, rejects and moves through the changes", () => {
    const { calls, review } = recording();
    for (const item of reviewMenu(state, review, false).groups.slice(1).flat()) item.onSelect();
    expect(calls.map(([name]) => name)).toEqual([
      "accept",
      "reject",
      "previous",
      "next",
      "acceptAll",
      "rejectAll",
      "display",
      "display",
      "display",
    ]);
  });

  it("is off while the document opens", () => {
    const items = reviewMenu(state, null, true).groups.flat();
    expect(items.every((item) => item.disabled)).toBe(true);
  });
});
