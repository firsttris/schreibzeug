import { describe, expect, it } from "vitest";
import { cellCommentEvents, initialCommentsState, isOnSheet, reduceComments } from "../src/comment-state";
import type { CellCommentData } from "../src/engine-types";

/** A cell comment as cell/model/CellComment.js asc_CCommentData answers. */
const cellComment = (id: string, text: string) =>
  ({
    asc_getId: () => id,
    asc_getText: () => text,
    asc_getQuoteText: () => "B3",
    asc_getTime: () => "",
    asc_getOnlyOfficeTime: () => "1700000000000",
    asc_getUserId: () => "u1",
    asc_getUserName: () => "Tristan",
    asc_getSolved: () => false,
    asc_getGuid: () => `g-${id}`,
    asc_getRepliesCount: () => 0,
  }) as unknown as CellCommentData;

describe("comments reported in lists", () => {
  it("adds a sheet's comments, takes moved ones anew and removes several at once", () => {
    const events = cellCommentEvents();
    let state = reduceComments(
      initialCommentsState,
      events.asc_onAddComments([cellComment("sheet1_a", "Prüfen"), cellComment("sheet2_b", "Summe?")]),
    );
    expect(state.comments.map((comment) => [comment.id, comment.text, comment.quote])).toEqual([
      ["sheet1_a", "Prüfen", "B3"],
      ["sheet2_b", "Summe?", "B3"],
    ]);
    state = reduceComments(
      state,
      events.asc_onChangeComments([{ Id: "sheet1_a", Comment: cellComment("sheet1_a", "Neu") }]),
    );
    expect(state.comments[0]?.text).toBe("Neu");
    state = reduceComments(
      { ...state, activeComments: ["sheet2_b"] },
      events.asc_onRemoveComments(["sheet2_b"]),
    );
    expect(state.comments.map((comment) => comment.id)).toEqual(["sheet1_a"]);
    expect(state.activeComments).toEqual([]);
  });

  it("knows the sheet a comment is on by its id", () => {
    const comment = reduceComments(
      initialCommentsState,
      cellCommentEvents().asc_onAddComments([cellComment("sheet7_x", "")]),
    ).comments[0];
    expect(comment && isOnSheet(comment, "7")).toBe(true);
    expect(comment && isOnSheet(comment, "70")).toBe(false);
  });
});
