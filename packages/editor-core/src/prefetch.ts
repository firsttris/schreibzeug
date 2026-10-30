import { converterPath } from "./converter";
import { framePath } from "./frame";

/**
 * The engine's files that opening a text document waits for, in the order they help most: x2t
 * first, which every Office file goes through and which is the largest (x2t.wasm, 35 MB), then the
 * text editor, whose code the PDF editor shares (frame.ts API_CONSTRUCTOR). The frame page loads
 * its scripts (engine/frame/editor/word/main/index.html), the API loads sdk-all.js once it exists
 * (common/editorscommon.js loadSdk) and the font engine (common/libfont/loader.js: fonts.js, which
 * fetches fonts.wasm beside it).
 */
export const prefetchedEngineFiles = (enginePath = "/engine"): string[] => {
  const root = enginePath.replace(/\/$/, "");
  return [
    `${root}/x2t/x2t.js`,
    `${root}/x2t/x2t.wasm`,
    converterPath(enginePath),
    framePath("word", enginePath),
    `${root}/vendor/jquery/jquery.min.js`,
    `${root}/vendor/xregexp/xregexp-all-min.js`,
    `${root}/sdkjs/common/AllFonts.js`,
    `${root}/sdkjs/word/sdk-all-min.js`,
    `${root}/sdkjs/word/sdk-all.js`,
    `${root}/sdkjs/common/libfont/engine/fonts.js`,
    `${root}/sdkjs/common/libfont/engine/fonts.wasm`,
  ];
};

/** Reads one file to its end, so the browser keeps it; a failure is the caller's to ignore. */
export type FetchToCache = (url: string) => Promise<void>;

/**
 * Fetches the files one after the other, so they do not take the line from what the page itself
 * loads. `stop` lets the file on its way finish, as an aborted download would start over when the
 * document opens, and starts no other. Resolves with the files fetched.
 */
export const prefetchFiles = (
  urls: readonly string[],
  fetchToCache: FetchToCache,
): { done: Promise<string[]>; stop: () => void } => {
  let stopped = false;
  const done = (async () => {
    const fetched: string[] = [];
    for (const url of urls) {
      if (stopped) break;
      try {
        await fetchToCache(url);
        fetched.push(url);
      } catch {
        // Not fetched now: the editor loads it when it needs it, as it would without this.
      }
    }
    return fetched;
  })();
  return {
    done,
    stop: () => {
      stopped = true;
    },
  };
};
