import { describe, expect, it } from "vitest";
import { prefetchedEngineFiles, prefetchFiles } from "../src/prefetch";

describe("prefetchedEngineFiles", () => {
  it("names x2t first, then the text editor's frame, code and font engine, under the engine's folder", () => {
    const files = prefetchedEngineFiles("/engine/15ac740e345f/");
    expect(files.slice(0, 3)).toEqual([
      "/engine/15ac740e345f/x2t/x2t.js",
      "/engine/15ac740e345f/x2t/x2t.wasm",
      "/engine/15ac740e345f/frame/x2t/worker.js",
    ]);
    expect(files).toContain("/engine/15ac740e345f/frame/editor/word/main/index.html");
    expect(files).toContain("/engine/15ac740e345f/sdkjs/word/sdk-all-min.js");
    expect(files).toContain("/engine/15ac740e345f/sdkjs/word/sdk-all.js");
    expect(files).toContain("/engine/15ac740e345f/sdkjs/common/libfont/engine/fonts.wasm");
  });
});

describe("prefetchFiles", () => {
  it("fetches one file after the other", async () => {
    const started: string[] = [];
    let running = 0;
    const { done } = prefetchFiles(["a", "b", "c"], async (url) => {
      expect(running).toBe(0);
      running++;
      started.push(url);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });
    expect(await done).toEqual(["a", "b", "c"]);
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("goes on past a file that fails", async () => {
    const { done } = prefetchFiles(["a", "b"], async (url) => {
      if (url === "a") throw new Error("404");
    });
    expect(await done).toEqual(["b"]);
  });

  it("lets the file on its way finish when stopped, and starts no other", async () => {
    let finish = () => {};
    const started: string[] = [];
    const prefetch = prefetchFiles(["a", "b"], (url) => {
      started.push(url);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    prefetch.stop();
    finish();
    expect(await prefetch.done).toEqual(["a"]);
    expect(started).toEqual(["a"]);
  });
});
