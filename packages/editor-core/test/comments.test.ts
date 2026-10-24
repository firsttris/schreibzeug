import { describe, expect, it } from "vitest";
import { readComment, writeComment } from "../src/comments";
import type { Comment } from "../src/state";
import { fakeCommentData } from "./fake-engine";

/** Berlin in summer: two hours ahead of UTC, so getTimezoneOffset is -120 minutes. */
const BERLIN_SUMMER = -120 * 60_000;
const NOON_UTC = Date.UTC(2026, 9, 23, 12, 0);

const comment: Omit<Comment, "id"> = {
  authorId: "u1",
  author: "Tristan",
  text: "Bitte prüfen",
  time: NOON_UTC,
  quote: "Hallo Schreibzeug",
  resolved: false,
  guid: "6A1B2C3D",
  replies: [{ authorId: "u2", author: "Anna", text: "Erledigt", time: NOON_UTC + 60_000 }],
};

describe("comments as data", () => {
  it("writes both of the engine's times: local-as-UTC and real milliseconds", () => {
    const data = writeComment(fakeCommentData, comment, BERLIN_SUMMER);
    expect(data.asc_getOnlyOfficeTime()).toBe(String(NOON_UTC));
    expect(data.asc_getTime()).toBe(String(NOON_UTC + 2 * 3_600_000));
  });

  it("reads back what it wrote, replies included", () => {
    const data = writeComment(fakeCommentData, comment, BERLIN_SUMMER);
    expect(readComment("c1", data, BERLIN_SUMMER)).toEqual({ id: "c1", ...comment });
  });

  it("reads the local time when a file has no OOTime", () => {
    const data = fakeCommentData();
    data.asc_putTime(String(NOON_UTC + 2 * 3_600_000));
    expect(readComment("c1", data, BERLIN_SUMMER).time).toBe(NOON_UTC);
  });

  it("treats an empty quote as a comment at the cursor", () => {
    const data = fakeCommentData();
    data.asc_putQuoteText("");
    expect(readComment("c1", data).quote).toBeNull();
  });
});
