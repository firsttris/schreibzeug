import type { SearchCommands, SearchState } from "@schreibzeug/editor-core";
import type { RefObject } from "react";
import { SearchBar } from "./search-bar";
import type { useSearchBar } from "./use-search-bar";

export type DocumentAreaProps = {
  /** The element the engine's frame is mounted in. */
  container: RefObject<HTMLDivElement | null>;
  search: SearchCommands | null;
  searchState: SearchState;
  searchBar: ReturnType<typeof useSearchBar>;
  readOnly: boolean;
};

/** The document itself, with the search bar over its top right corner when it is open. */
export const DocumentArea = ({ container, search, searchState, searchBar, readOnly }: DocumentAreaProps) => (
  <div className="relative min-h-0 min-w-0 flex-1">
    <div ref={container} className="h-full bg-[var(--muted)]" />
    {searchBar.mode && (
      <SearchBar
        search={search}
        state={searchState}
        mode={searchBar.mode}
        canReplace={!readOnly}
        onModeChange={searchBar.open}
        onClose={searchBar.close}
      />
    )}
  </div>
);
