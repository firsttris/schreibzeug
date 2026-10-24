import type { ContextMenuArgs, ViewApi } from "./engine-types";

/** What the clipboard commands do; the engine names them the same in every editor. */
export type ClipboardAction = "copy" | "cut" | "paste";

/** Zoom and the clipboard: the commands of the "Bearbeiten" and "Ansicht" menus. */
export type ViewCommands = {
  /**
   * Copies, cuts or pastes as a menu entry does (common/clipboard_base.js Button_Copy, Button_Cut,
   * Button_Paste). False when the browser refused: without a key press it may not touch the
   * clipboard, and the person has to use the keys (web-apps shows the same hint then).
   */
  clipboard: (action: ClipboardAction) => boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Percent, clamped to what the toolbar offers. */
  setZoom: (percent: number) => void;
  fitWidth: () => void;
  fitPage: () => void;
};

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 500;

export const clampZoom = (percent: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent)));

/**
 * word/api.js and slide/api.js `Copy`, `Cut`, `Paste` and the zoom functions. Paste may read the
 * clipboard asynchronously and returns undefined then; only an explicit false means refused.
 */
export const createViewCommands = (api: ViewApi): ViewCommands => ({
  clipboard: (action) => {
    const done = action === "copy" ? api.Copy() : action === "cut" ? api.Cut() : api.Paste();
    return done !== false;
  },
  zoomIn: () => api.zoomIn(),
  zoomOut: () => api.zoomOut(),
  setZoom: (percent) => api.zoom(clampZoom(percent)),
  fitWidth: () => api.zoomFitToWidth(),
  fitPage: () => api.zoomFitToPage(),
});

/** Where someone right-clicked, in the coordinates of the engine frame's window. */
export type ContextMenuRequest = { x: number; y: number; area: "body" | "headerFooter" };

export type ContextMenuListener = (request: ContextMenuRequest) => void;

/**
 * Turns the engine's right click (word/api.js and slide/api.js sync_ContextMenuCallback,
 * `asc_onContextMenu` with a CContextMenuData) into a request for our own menu. The engine gives
 * the point relative to its view element, as web-apps places its menu there (documenteditor
 * DocumentHolder.js showPopupMenu); we add the element's place in the frame.
 */
export const toContextMenuRequest = (
  data: ContextMenuArgs,
  view: { getBoundingClientRect(): { left: number; top: number } } | null,
  headerFooterType: number,
): ContextMenuRequest => {
  const origin = view?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return {
    x: origin.left + data.get_X(),
    y: origin.top + data.get_Y(),
    area: data.get_Type() === headerFooterType ? "headerFooter" : "body",
  };
};

/** A small list of listeners, for engine events that are things to do rather than state. */
export const createListeners = <T>() => {
  const listeners = new Set<(value: T) => void>();
  return {
    add: (listener: (value: T) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (value: T) => {
      for (const listener of listeners) listener(value);
    },
  };
};
