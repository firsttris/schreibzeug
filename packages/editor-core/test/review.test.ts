import { describe, expect, it } from "vitest";
import type { EngineRevision, WordEngineApi } from "../src/engine-types";
import { createReviewCommands, readRevision, trackingOf } from "../src/review";

const TYPES = { TextAdd: 1, TextRem: 2, ParaAdd: 3, ParaRem: 4, TextPr: 5, ParaPr: 6 };

const revision = (type: number, value: unknown, date: unknown = ""): EngineRevision => ({
  get_UserName: () => "Ben",
  get_DateTime: () => date as string,
  get_Type: () => type,
  get_Value: () => value,
  get_X: () => 1,
  get_Y: () => 2,
});

describe("a tracked change", () => {
  it("reads its kind and text, leaving drawings out", () => {
    expect(readRevision(revision(2, ["alt", { drawing: true }, "er"]), TYPES)).toMatchObject({
      kind: "delete",
      text: "alter",
      time: null,
    });
    expect(readRevision(revision(5, {}), TYPES)).toMatchObject({ kind: "format", text: "" });
    expect(readRevision(revision(3, undefined), TYPES).kind).toBe("paragraphInsert");
    expect(readRevision(revision(9, undefined), TYPES).kind).toBe("other");
  });

  it("takes the date as milliseconds or an ISO date", () => {
    expect(readRevision(revision(1, "a", "2026-10-24T10:00:00Z"), TYPES).time).toBe(
      Date.parse("2026-10-24T10:00:00Z"),
    );
    expect(readRevision(revision(1, "a", "kaputt"), TYPES).time).toBeNull();
  });
});

describe("whether edits are tracked", () => {
  it("follows the user's own flag, else the document's", () => {
    expect(trackingOf(null, true)).toBe(true);
    expect(trackingOf(false, true)).toBe(false);
    expect(trackingOf(true, false)).toBe(true);
  });
});

describe("the review commands", () => {
  it("accept and reject at the cursor and move on, or everything at once", () => {
    const calls: unknown[][] = [];
    const api = new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args: unknown[]) =>
            calls.push([name, ...args]),
      },
    ) as WordEngineApi;
    const commands = createReviewCommands(api, { Edit: 0, Final: 1, Original: 2 }, () => {});
    commands.accept();
    commands.reject();
    commands.next();
    commands.previous();
    commands.acceptAll();
    commands.rejectAll();
    commands.setDisplay("original");
    expect(calls).toEqual([
      ["asc_AcceptChangesBySelection", true],
      ["asc_RejectChangesBySelection", true],
      ["asc_GetNextRevisionsChange"],
      ["asc_GetPrevRevisionsChange"],
      ["asc_AcceptAllChanges"],
      ["asc_RejectAllChanges"],
      ["asc_SetDisplayModeInReview", 2],
    ]);
  });
});
