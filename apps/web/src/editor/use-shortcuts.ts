import { type AppShortcut, shortcutOf } from "@stapel/editor-core";
import { useEffect, useRef } from "react";

export type ShortcutSource = { onShortcut: (listener: (shortcut: AppShortcut) => void) => () => void };

/**
 * Strg+F, Strg+H and Strg+P, in the document (the engine's frame tells through `onShortcut`) and
 * anywhere else in the window, instead of the browser's own search and print.
 */
export const useShortcuts = (
  editor: ShortcutSource | null,
  handlers: Partial<Record<AppShortcut, () => void>>,
) => {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!editor) return;
    const run = (shortcut: AppShortcut) => latest.current[shortcut]?.();
    const stop = editor.onShortcut(run);
    const onKey = (event: KeyboardEvent) => {
      const shortcut = shortcutOf(event);
      if (!shortcut || !latest.current[shortcut]) return;
      event.preventDefault();
      run(shortcut);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey);
    };
  }, [editor]);
};
