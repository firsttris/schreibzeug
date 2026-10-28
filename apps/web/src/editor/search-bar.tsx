import type { SearchCommands, SearchQuery, SearchState } from "@schreibzeug/editor-core";
import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import type { SearchMode } from "./use-search-bar";

export type SearchBarProps = {
  search: SearchCommands | null;
  state: SearchState;
  /** "replace" shows the second row; someone who may only look gets "find" only. */
  mode: SearchMode;
  canReplace: boolean;
  onModeChange: (mode: SearchMode) => void;
  onClose: () => void;
};

const inputClass =
  "h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--foreground)]";

/** "2 von 5", "Keine Treffer", or how many were replaced. */
const resultText = ({ current, total, replaced }: SearchState, text: string): string => {
  if (replaced !== null)
    return replaced === 1
      ? m.search_bar_replaced_one({ count: replaced })
      : m.search_bar_replaced_other({ count: replaced });
  if (!text) return "";
  if (total === 0) return m.search_bar_no_matches();
  return m.search_bar_position({ current: current + 1, total });
};

/** How long typing pauses before the search runs, as web-apps waits (Search.js onInputSearchChange). */
const TYPING_PAUSE_MS = 300;

/**
 * Find and replace over the document, at its top right as in an office suite. Searching starts
 * while typing; Enter goes to the next match, Shift+Enter to the previous. Closing takes the marks
 * of the matches away.
 */
export const SearchBar = ({ search, state, mode, canReplace, onModeChange, onClose }: SearchBarProps) => {
  const [query, setQuery] = useState<SearchQuery>({ text: "", matchCase: false, wholeWords: false });
  const [replacement, setReplacement] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Strg+F again while the bar is open puts the cursor back into it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus whenever the bar is asked for again
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [mode]);

  useEffect(() => {
    if (!search) return;
    const timer = setTimeout(() => (query.text ? search.find(query, true) : search.end()), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [search, query]);

  useEffect(() => () => search?.end(), [search]);

  const go = (forward: boolean) => search?.find(query, forward);
  const toggle = (option: "matchCase" | "wholeWords") => setQuery({ ...query, [option]: !query[option] });

  return (
    <search
      aria-label={m.search_bar_label()}
      className="absolute top-3 right-4 z-10 flex w-[min(26rem,calc(100%-2rem))] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-lg"
    >
      <div className="flex items-center gap-1">
        <input
          ref={input}
          aria-label={m.common_find()}
          placeholder={m.common_find()}
          value={query.text}
          onChange={(event) => setQuery({ ...query, text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") go(!event.shiftKey);
            if (event.key === "Escape") onClose();
          }}
          className={inputClass}
        />
        <span
          data-testid="search-result"
          className="w-24 shrink-0 text-right text-xs text-[var(--muted-foreground)] tabular-nums"
        >
          {resultText(state, query.text)}
        </span>
        <Button
          variant="ghost"
          aria-label={m.search_bar_previous()}
          disabled={!query.text}
          onClick={() => go(false)}
        >
          <ChevronUp size={15} />
        </Button>
        <Button
          variant="ghost"
          aria-label={m.search_bar_next()}
          disabled={!query.text}
          onClick={() => go(true)}
        >
          <ChevronDown size={15} />
        </Button>
        <Button variant="ghost" aria-label={m.search_bar_close()} onClick={onClose}>
          <X size={15} />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="toggle"
          aria-label={m.search_bar_match_case()}
          aria-pressed={query.matchCase}
          onClick={() => toggle("matchCase")}
        >
          <CaseSensitive size={16} />
        </Button>
        <Button
          variant="toggle"
          aria-label={m.search_bar_whole_words()}
          aria-pressed={query.wholeWords}
          onClick={() => toggle("wholeWords")}
        >
          <WholeWord size={16} />
        </Button>
        {canReplace && mode === "find" && (
          <Button variant="ghost" className="ml-auto" onClick={() => onModeChange("replace")}>
            {m.search_bar_show_replace()}
          </Button>
        )}
      </div>
      {canReplace && mode === "replace" && (
        <div className="flex items-center gap-1">
          <input
            aria-label={m.search_bar_replace_with()}
            placeholder={m.search_bar_replace_with()}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search?.replace(query, replacement);
              if (event.key === "Escape") onClose();
            }}
            className={inputClass}
          />
          <Button
            variant="outline"
            disabled={!query.text}
            onClick={() => search?.replace(query, replacement)}
          >
            {m.common_replace()}
          </Button>
          <Button
            variant="outline"
            disabled={!query.text}
            onClick={() => search?.replaceAll(query, replacement)}
          >
            {m.search_bar_replace_all()}
          </Button>
        </div>
      )}
    </search>
  );
};
