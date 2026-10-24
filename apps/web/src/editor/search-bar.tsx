import type { FindShortcut, SearchCommands, SearchQuery, SearchState } from "@stapel/editor-core";
import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";

export type SearchBarProps = {
  search: SearchCommands | null;
  state: SearchState;
  /** "replace" shows the second row; someone who may only look gets "find" only. */
  mode: FindShortcut;
  canReplace: boolean;
  onModeChange: (mode: FindShortcut) => void;
  onClose: () => void;
};

const inputClass =
  "h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--foreground)]";

/** "2 von 5", "Keine Treffer", or how many were replaced. */
const resultText = ({ current, total, replaced }: SearchState, text: string): string => {
  if (replaced !== null) return replaced === 1 ? "1 ersetzt" : `${replaced} ersetzt`;
  if (!text) return "";
  if (total === 0) return "Keine Treffer";
  return `${current + 1} von ${total}`;
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
      aria-label="Suchen und ersetzen"
      className="absolute top-3 right-4 z-10 flex w-[min(26rem,calc(100%-2rem))] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-lg"
    >
      <div className="flex items-center gap-1">
        <input
          ref={input}
          aria-label="Suchen"
          placeholder="Suchen"
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
          aria-label="Vorheriger Treffer"
          disabled={!query.text}
          onClick={() => go(false)}
        >
          <ChevronUp size={15} />
        </Button>
        <Button variant="ghost" aria-label="Nächster Treffer" disabled={!query.text} onClick={() => go(true)}>
          <ChevronDown size={15} />
        </Button>
        <Button variant="ghost" aria-label="Suche schließen" onClick={onClose}>
          <X size={15} />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="toggle"
          aria-label="Groß-/Kleinschreibung beachten"
          aria-pressed={query.matchCase}
          onClick={() => toggle("matchCase")}
        >
          <CaseSensitive size={16} />
        </Button>
        <Button
          variant="toggle"
          aria-label="Nur ganze Wörter"
          aria-pressed={query.wholeWords}
          onClick={() => toggle("wholeWords")}
        >
          <WholeWord size={16} />
        </Button>
        {canReplace && mode === "find" && (
          <Button variant="ghost" className="ml-auto" onClick={() => onModeChange("replace")}>
            Ersetzen …
          </Button>
        )}
      </div>
      {canReplace && mode === "replace" && (
        <div className="flex items-center gap-1">
          <input
            aria-label="Ersetzen durch"
            placeholder="Ersetzen durch"
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
            Ersetzen
          </Button>
          <Button
            variant="outline"
            disabled={!query.text}
            onClick={() => search?.replaceAll(query, replacement)}
          >
            Alle ersetzen
          </Button>
        </div>
      )}
    </search>
  );
};
