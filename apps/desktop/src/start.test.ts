import { describe, expect, it } from "vitest";
import { LOCAL, placeToOpen } from "./start";

describe("where the app starts", () => {
  it("goes back to the files on this computer when they were open last", () => {
    expect(placeToOpen(LOCAL, ["https://a.example"], false)).toEqual({ kind: "local" });
  });

  it("goes back to the newest server otherwise", () => {
    expect(placeToOpen(null, ["https://a.example", "https://b.example"], false)).toEqual({
      kind: "server",
      url: "https://a.example",
    });
  });

  it("shows the choice on the first start and when asked for it", () => {
    expect(placeToOpen(null, [], false)).toBeNull();
    expect(placeToOpen(LOCAL, ["https://a.example"], true)).toBeNull();
  });
});
