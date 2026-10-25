import { describe, expect, it } from "vitest";
import { withoutEmbedParam } from "./embed";
import { isAppPath, isEmbedded, isKontextShortcut, readMessage } from "./messages";

const parent = {};
const origin = "https://kontext.example.org";

describe("readMessage", () => {
  it("takes Kontext's messages from the parent window at its origin", () => {
    const data = { source: "kontext", type: "theme", theme: "dark" };
    expect(readMessage({ origin, source: parent, data }, { origin, parent })).toEqual(data);
  });

  it("ignores other origins, other windows and other shapes", () => {
    const data = { source: "kontext", type: "logout" };
    expect(
      readMessage({ origin: "https://evil.example", source: parent, data }, { origin, parent }),
    ).toBeNull();
    expect(readMessage({ origin, source: {}, data }, { origin, parent })).toBeNull();
    expect(readMessage({ origin, source: parent, data: { type: "logout" } }, { origin, parent })).toBeNull();
    expect(readMessage({ origin, source: parent, data: "logout" }, { origin, parent })).toBeNull();
  });
});

describe("isEmbedded", () => {
  const facts = { search: "?embedded=kontext", remembered: false, inFrame: true, embedOrigin: origin };

  it("needs the frame, the origin that may embed, and the parameter or its memory", () => {
    expect(isEmbedded(facts)).toBe(true);
    expect(isEmbedded({ ...facts, search: "", remembered: true })).toBe(true);
    expect(isEmbedded({ ...facts, search: "" })).toBe(false);
    expect(isEmbedded({ ...facts, inFrame: false })).toBe(false);
    expect(isEmbedded({ ...facts, embedOrigin: undefined })).toBe(false);
  });
});

describe("paths and keys", () => {
  it("opens only paths of the app", () => {
    expect(isAppPath("/edit/1")).toBe(true);
    expect(isAppPath("//evil.example")).toBe(false);
    expect(isAppPath("https://evil.example")).toBe(false);
    expect(isAppPath("/\\evil.example")).toBe(false);
    expect(isAppPath("/\t/evil.example")).toBe(false);
    expect(isAppPath("/edit/1?embedded=kontext#x")).toBe(true);
  });

  it("drops the frame parameter and keeps the rest", () => {
    expect(withoutEmbedParam("/folders/1?embedded=kontext&x=1")).toBe("/folders/1?x=1");
    expect(withoutEmbedParam("/?embedded=kontext")).toBe("/");
  });

  it("passes on Kontext's module keys, not the browser's", () => {
    const key = (k: string, modifiers = {}) => ({
      key: k,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...modifiers,
    });
    expect(isKontextShortcut(key("6"))).toBe(true);
    expect(isKontextShortcut(key("?"))).toBe(true);
    expect(isKontextShortcut(key("1", { ctrlKey: true }))).toBe(false);
    expect(isKontextShortcut(key("a"))).toBe(false);
  });
});
