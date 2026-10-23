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

type FocusableWindow = Pick<Window, "addEventListener"> & {
  document: Pick<Document, "hasFocus" | "activeElement" | "body">;
};

/**
 * Gives the engine keyboard focus when someone presses the mouse in its frame. The engine cancels
 * mousedown on its canvas, so the browser leaves focus where it was, e.g. on a toolbar button of the
 * app, and typed keys never reach the document. Focusing the engine's hidden input fires the
 * document "focus" event sdkjs listens for (common/text_input2.js), which turns key events back on.
 */
export const keepFocusOnClick = (win: FocusableWindow, input: () => HTMLElement): void => {
  win.addEventListener(
    "pointerdown",
    () => {
      const { document } = win;
      // Nothing in the frame holds the keys; an element of the engine that does keeps them.
      if (!document.hasFocus() || document.activeElement === document.body) input().focus();
    },
    true,
  );
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
