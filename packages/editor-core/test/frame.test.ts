import { describe, expect, it } from "vitest";
import { framePath, keepFocusOnClick, mountEngineFrame } from "../src/frame";
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

describe("keepFocusOnClick", () => {
  const fakeFrame = (focused: boolean, active: "body" | "input") => {
    const target = new EventTarget();
    const body = {};
    let focusCalls = 0;
    const input = {
      focus: () => {
        focusCalls += 1;
      },
    };
    const win = {
      addEventListener: target.addEventListener.bind(target),
      document: { hasFocus: () => focused, body, activeElement: active === "body" ? body : input },
    };
    keepFocusOnClick(win as never, () => input as never);
    return { press: () => target.dispatchEvent(new Event("pointerdown")), focusCalls: () => focusCalls };
  };

  it("focuses the engine's input when a press lands in the frame while focus is elsewhere", () => {
    const frame = fakeFrame(false, "input");
    frame.press();
    expect(frame.focusCalls()).toBe(1);
  });

  it("focuses the input when the frame has focus but nothing in it holds the keys", () => {
    const frame = fakeFrame(true, "body");
    frame.press();
    expect(frame.focusCalls()).toBe(1);
  });

  it("leaves focus alone when the engine already has it", () => {
    const frame = fakeFrame(true, "input");
    frame.press();
    expect(frame.focusCalls()).toBe(0);
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
