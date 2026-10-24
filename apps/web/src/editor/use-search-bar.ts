import { useState } from "react";

export type SearchMode = "find" | "replace";

/** Whether the search bar is open, and whether with replace; someone who may only look just finds. */
export const useSearchBar = (canReplace: boolean) => {
  const [mode, setMode] = useState<SearchMode | null>(null);
  return {
    mode,
    open: (next: SearchMode) => setMode(next === "replace" && !canReplace ? "find" : next),
    close: () => setMode(null),
  };
};
