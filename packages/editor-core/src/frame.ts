import type { EngineWindow } from "./engine-types";

export type EditorKind = "word";

export type FrameOptions = {
  kind: EditorKind;
  /** Where engine/dist is served. */
  enginePath?: string;
  /** How long to wait for sdkjs to load, in milliseconds. */
  timeoutMs?: number;
};

export type EngineFrame = {
  window: EngineWindow;
  element: HTMLIFrameElement;
  remove: () => void;
};

/**
 * The host page of each editor, four folders below the engine root, because sdkjs resolves its
 * files as "../../../../sdkjs/…" relative to the page (engine/frame/editor/word/main/index.html).
 */
export const framePath = (kind: EditorKind, enginePath = "/engine"): string =>
  `${enginePath.replace(/\/$/, "")}/frame/editor/${kind}/main/index.html`;

const isEngineLoaded = (win: Window | null): win is EngineWindow => {
  const candidate = win as Partial<EngineWindow> | null;
  return Boolean(candidate?.Asc?.asc_docs_api && candidate.AscCommon);
};

/**
 * Loads the engine in a same-origin iframe. The iframe keeps the engine's globals (Asc, AscCommon,
 * AscFonts, …) out of the app and gives every open document its own engine instance.
 */
export const mountEngineFrame = (container: HTMLElement, options: FrameOptions): Promise<EngineFrame> => {
  const element = container.ownerDocument.createElement("iframe");
  element.src = framePath(options.kind, options.enginePath);
  element.title = "Editor";
  element.setAttribute("data-testid", "engine-frame");
  element.style.cssText = "border:0;width:100%;height:100%;display:block";

  const remove = () => element.remove();

  return new Promise<EngineFrame>((resolve, reject) => {
    const timer = setTimeout(() => {
      remove();
      reject(new Error("The editor engine did not load in time."));
    }, options.timeoutMs ?? 30_000);

    element.addEventListener("load", () => {
      clearTimeout(timer);
      const win = element.contentWindow;
      if (isEngineLoaded(win)) {
        resolve({ window: win, element, remove });
      } else {
        remove();
        reject(new Error("The editor engine is missing. Run `bun run engine:prepare`."));
      }
    });
    container.append(element);
  });
};
