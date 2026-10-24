import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_DELAY,
  autosaveDelay,
  initialProgress,
  isAhead,
  readProgress,
  type SessionProgress,
} from "../src/session-progress";

const read = (messages: object[], start: SessionProgress = initialProgress) =>
  messages.reduce<SessionProgress>(
    (progress, message) => readProgress(progress, JSON.stringify(message)),
    start,
  );

describe("readProgress", () => {
  it("counts the log a newcomer gets, others' changes and its own placed changes", () => {
    expect(read([{ type: "authChanges", changes: [1, 2] }])).toEqual({ seen: 2, saved: 0, lastAuthor: null });
    expect(read([{ type: "saveChanges", changes: [], syncChangesIndex: 5 }])).toMatchObject({
      seen: 5,
      lastAuthor: "other",
    });
    expect(read([{ type: "unSaveLock", index: 4, syncChangesIndex: 6 }])).toMatchObject({
      seen: 6,
      lastAuthor: "me",
    });
  });

  it("follows the relay's saved index without going back", () => {
    expect(
      read([
        { type: "schreibzeug:saved", index: 4 },
        { type: "schreibzeug:saved", index: 2 },
      ]).saved,
    ).toBe(4);
  });

  it("leaves the progress as it is for other messages and broken text", () => {
    expect(readProgress(initialProgress, '{"type":"cursor"}')).toBe(initialProgress);
    expect(readProgress(initialProgress, "{")).toBe(initialProgress);
    expect(read([{ type: "unSaveLock", syncChangesIndex: -1 }])).toBe(initialProgress);
  });
});

describe("autosaveDelay", () => {
  const ahead = (lastAuthor: SessionProgress["lastAuthor"]) => ({ seen: 3, saved: 1, lastAuthor });

  it("has nothing to save when the stored version holds everything and nothing is pending", () => {
    expect(isAhead({ seen: 2, saved: 2, lastAuthor: "me" })).toBe(false);
    expect(autosaveDelay({ seen: 2, saved: 2, lastAuthor: "me" }, false)).toBeNull();
  });

  it("lets the author of the newest change save first and the others later", () => {
    expect(autosaveDelay(ahead("me"), false)).toBe(AUTOSAVE_DELAY.author);
    expect(autosaveDelay(ahead("other"), false)).toBe(AUTOSAVE_DELAY.fallback);
    expect(autosaveDelay(ahead(null), false)).toBe(AUTOSAVE_DELAY.author);
  });

  it("saves own changes the engine has not handed over yet, also when editing alone", () => {
    expect(autosaveDelay(initialProgress, true)).toBe(AUTOSAVE_DELAY.author);
  });
});
