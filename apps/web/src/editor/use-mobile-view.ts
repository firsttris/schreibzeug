import type { MobileViewCommands } from "@schreibzeug/editor-core";
import { useEffect, useRef, useState } from "react";

/** Below Tailwind's `sm`, where the editor's header becomes one row: a phone held upright. */
const PHONE = "(max-width: 639px)";

const isPhone = () => {
  try {
    return window.matchMedia(PHONE).matches;
  } catch {
    return false;
  }
};

/**
 * The text in the width of the screen (editor-core word-mobile-view.ts): on a phone from the
 * start, as web-apps' mobile editor opens documents, and switched in "Ansicht" anywhere.
 */
export const useMobileView = (commands: MobileViewCommands | null) => {
  const [on, setOn] = useState(isPhone);
  // The pages are what the engine shows anyway; it is told only once the view is or was on.
  const switched = useRef(false);
  useEffect(() => {
    if (!commands || (!on && !switched.current)) return;
    switched.current = true;
    commands.set(on);
  }, [commands, on]);
  return { on, toggle: () => setOn((current) => !current) };
};
