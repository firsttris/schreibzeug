import { describe, expect, it } from "vitest";
import { framePath, mountEngineFrame } from "../src/frame";
import { createStore } from "../src/store";

describe("framePath", () => {
  it("points four folders below the engine root, where sdkjs expects its host page", () => {
    expect(framePath("word")).toBe("/engine/frame/editor/word/main/index.html");
  });

  it("accepts an engine path with or without a trailing slash", () => {
    expect(framePath("word", "/assets/engine/")).toBe("/assets/engine/frame/editor/word/main/index.html");
  });
});

describe("mountEngineFrame", () => {
  it("adds an iframe for the engine page", () => {
    const container = document.createElement("div");
    void mountEngineFrame(container, { kind: "word", timeoutMs: 5 }).catch(() => {});
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("/engine/frame/editor/word/main/index.html");
  });

  it("removes the iframe and fails when the engine does not load", async () => {
    const container = document.createElement("div");
    await expect(mountEngineFrame(container, { kind: "word", timeoutMs: 5 })).rejects.toThrow("did not load");
    expect(container.querySelector("iframe")).toBeNull();
  });
});

describe("createStore", () => {
  it("does not notify when the state stays the same", () => {
    const store = createStore({ n: 1 });
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.set((state) => state);
    store.set((state) => ({ n: state.n + 1 }));
    expect(calls).toBe(1);
    expect(store.get().n).toBe(2);
  });
});
