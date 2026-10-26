import type { TextViewMode } from "@schreibzeug/text-editor";
import { useState } from "react";

const KEY = "schreibzeug.text-view";
const MODES: readonly TextViewMode[] = ["live", "split", "source"];

/** The browser's storage may be missing or refuse (private windows); the live view is the default. */
const stored = (): TextViewMode => {
  try {
    const value = localStorage.getItem(KEY);
    return MODES.find((mode) => mode === value) ?? "live";
  } catch {
    return "live";
  }
};

/** How Markdown is shown, remembered in this browser for the next note; plain text has only its source. */
export const useViewMode = (markdown: boolean): [TextViewMode, (mode: TextViewMode) => void] => {
  const [mode, setMode] = useState<TextViewMode>(() => (markdown ? stored() : "source"));
  const choose = (next: TextViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Only remembered for this tab then.
    }
  };
  return [mode, choose];
};
