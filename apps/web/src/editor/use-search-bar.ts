import { type FindShortcut, findShortcutOf } from "@stapel/editor-core";
import { useCallback, useEffect, useState } from "react";

/**
 * Whether the search bar is open, and in which mode. Strg+F and Strg+H open it, in the document
 * (the engine's frame tells through `onFindShortcut`) and anywhere else in the window.
 */
export const useSearchBar = (
  editor: { onFindShortcut: (listener: (shortcut: FindShortcut) => void) => () => void } | null,
  canReplace: boolean,
) => {
  const [mode, setMode] = useState<FindShortcut | null>(null);
  const open = useCallback(
    (shortcut: FindShortcut) => setMode(shortcut === "replace" && !canReplace ? "find" : shortcut),
    [canReplace],
  );

  useEffect(() => {
    if (!editor) return;
    const stop = editor.onFindShortcut(open);
    const onKey = (event: KeyboardEvent) => {
      const shortcut = findShortcutOf(event);
      if (!shortcut) return;
      event.preventDefault();
      open(shortcut);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey);
    };
  }, [editor, open]);

  return { mode, open, close: () => setMode(null) };
};
