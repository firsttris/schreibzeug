import type { SlideShow } from "@stapel/editor-core";
import { type RefObject, useEffect } from "react";

type ShowSource = { slideShow: SlideShow; resize: () => void };

/** Two frames: the browser has given the frame the screen's size by then. */
const nextLayout = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * The slide show full screen: the engine's frame goes full screen first and the show starts once
 * it has the screen's size, as web-apps starts it after the window resized (controller/Viewport.js
 * onPreviewStart). Leaving full screen (Escape in the browser) ends the show, and the end of the
 * show (Escape or a click after the last slide, in the engine) leaves full screen.
 */
export const useSlideShow = (
  editor: ShowSource | null,
  container: RefObject<HTMLDivElement | null>,
  running: boolean,
) => {
  useEffect(() => {
    if (!editor) return;
    const onChange = () => {
      editor.resize();
      if (!document.fullscreenElement && running) editor.slideShow.end();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [editor, running]);

  useEffect(() => {
    if (!running && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [running]);

  if (!editor) return null;
  return async (from: "current" | "beginning") => {
    const frame = container.current?.querySelector("iframe");
    // Without full screen (a browser that refuses it) the show fills the editor's area.
    await frame?.requestFullscreen().catch(() => {});
    await nextLayout();
    editor.resize();
    editor.slideShow.start(from);
  };
};
