import { describe, expect, it } from "vitest";
import { shouldPrefetchEngine } from "./prefetch-engine";

describe("shouldPrefetchEngine", () => {
  it("loads the engine ahead in a build the browser keeps, over the network", () => {
    expect(shouldPrefetchEngine({ production: true, local: false, saveData: false })).toBe(true);
  });

  it("leaves it in development, where the engine is sent anew every time", () => {
    expect(shouldPrefetchEngine({ production: false, local: false, saveData: false })).toBe(false);
  });

  it("leaves it when the files are on this computer", () => {
    expect(shouldPrefetchEngine({ production: true, local: true, saveData: false })).toBe(false);
  });

  it("leaves it when the browser asks to spare data", () => {
    expect(shouldPrefetchEngine({ production: true, local: false, saveData: true })).toBe(false);
  });
});
