import type { SearchApi, SearchSettings } from "./engine-types";

/** What to look for. */
export type SearchQuery = { text: string; matchCase: boolean; wholeWords: boolean };

/** Find and replace (the "Suchen und ersetzen" bar). */
export type SearchCommands = {
  /** Selects the next or previous match and returns how many there are. */
  find: (query: SearchQuery, forward: boolean) => number;
  /** Replaces the selected match and goes to the next; false when there was none. */
  replace: (query: SearchQuery, replacement: string) => boolean;
  replaceAll: (query: SearchQuery, replacement: string) => void;
  /** Takes the marks of the matches away again. */
  end: () => void;
};

/**
 * word/api.js and slide/api.js `asc_findText`, `asc_replaceText`, `asc_endFindText` with a
 * common/api/searchSettings.js `CSearchSettings`, filled as web-apps does
 * (documenteditor main controller/Search.js onQuerySearch, onQueryReplace, onQueryReplaceAll).
 * The settings are made in the engine's frame (`newSettings`), so they belong to its realm.
 *
 * The engine tells the selected match with asc_onSetSearchCurrent, but says nothing when there is
 * none; `noMatches` reports that, and that the search has ended.
 */
export const createSearchCommands = (
  api: SearchApi,
  newSettings: () => SearchSettings,
  noMatches: () => void,
): SearchCommands => {
  const settingsFor = ({ text, matchCase, wholeWords }: SearchQuery) => {
    const settings = newSettings();
    settings.put_Text(text);
    settings.put_MatchCase(matchCase);
    settings.put_WholeWords(wholeWords);
    return settings;
  };
  return {
    find: (query, forward) => {
      const total = query.text ? api.asc_findText(settingsFor(query), forward) : 0;
      if (total === 0) noMatches();
      return total;
    },
    replace: (query, replacement) =>
      query.text ? api.asc_replaceText(settingsFor(query), replacement, false) !== false : false,
    replaceAll: (query, replacement) => {
      if (query.text) api.asc_replaceText(settingsFor(query), replacement, true);
    },
    end: () => {
      api.asc_endFindText();
      noMatches();
    },
  };
};
