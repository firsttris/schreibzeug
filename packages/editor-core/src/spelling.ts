/**
 * Spell checking without the Document Server. Without a spell checker address the engine checks
 * in its own worker (common/apiBase.js _coSpellCheckInit: CSpellchecker, common/spell/spell.js,
 * Hunspell as WebAssembly) and loads the dictionaries from `engine/dictionaries`, which
 * engine/scripts/prepare.ts fills from the release package. It checks every language it lists
 * (AscCommon.spellcheckGetLanguages); a language without its dictionary would mark every word, so
 * the list is cut down to the dictionaries we ship.
 *
 * The misspelled word at the cursor comes with the selection (asc_onFocusObject, a
 * c_oAscTypeSelectElement.SpellCheck element: common/apiCommon.js asc_CSpellCheckProperty); the
 * context menu offers its suggestions, as web-apps' (documenteditor main DocumentHolderExt.js).
 */
import type { EngineSpellCheck, SpellingApi } from "./engine-types";

/** The dictionaries in engine/dist/dictionaries (engine/engine.json "dictionaries"). */
export const SPELL_LANGUAGES = ["de_DE", "de_AT", "de_CH", "en_US", "en_GB"] as const;

/** common/spell/spell.js: language id → { name, hyphen } for every language the engine knows. */
export type SpellLanguages = Record<string, { name: string; hyphen: boolean }>;

export const onlyShipped = (languages: SpellLanguages): SpellLanguages =>
  Object.fromEntries(
    Object.entries(languages).filter(([, language]) =>
      (SPELL_LANGUAGES as readonly string[]).includes(language.name),
    ),
  );

/**
 * Cuts the engine's language list down before the editor starts its spell checker, which reads it
 * once (CSpellchecker `this.languages`).
 */
export const limitSpellLanguages = (common: { spellcheckGetLanguages?: () => SpellLanguages }): void => {
  const all = common.spellcheckGetLanguages;
  if (!all) return;
  const shipped = onlyShipped(all());
  common.spellcheckGetLanguages = () => shipped;
};

/**
 * The spell checker runs in a SharedWorker where the browser has one (spell.js
 * `isUseSharedWorker`); from the editor's frame that worker never answered in Chromium, while a
 * worker of the frame's own does. spell.js already does without one for WebKit's WKWebView, so
 * hiding SharedWorker in the frame takes the same path everywhere.
 */
export const useDedicatedSpellWorker = (win: object): void => {
  Object.defineProperty(win, "SharedWorker", { value: undefined, configurable: true });
};

/** A misspelled word at the cursor and what the dictionary suggests instead. */
export type Misspelled = { word: string; suggestions: string[] };

/** The misspelled word among the selected elements, if the cursor is in one. */
export const findMisspelled = (
  objects: Array<{ asc_getObjectType(): number; get_ObjectValue?: () => unknown }>,
  spellCheckType: number,
): EngineSpellCheck | null => {
  const element = objects.find((object) => object.asc_getObjectType() === spellCheckType);
  const value = element?.get_ObjectValue?.() as EngineSpellCheck | undefined;
  return value && value.get_Checked() === false ? value : null;
};

export const readMisspelled = (value: EngineSpellCheck | null): Misspelled | null =>
  value ? { word: value.get_Word(), suggestions: [...(value.get_Variants() ?? [])] } : null;

export type SpellingCommands = {
  /** Turns the red underlines on or off. */
  setEnabled: (on: boolean) => void;
  /** Replaces the misspelled word at the cursor. */
  replace: (suggestion: string) => void;
  /** Leaves this place of the word, or the word everywhere in the document, unmarked. */
  ignore: (everywhere: boolean) => void;
};

export const createSpellingCommands = (
  api: SpellingApi,
  current: () => EngineSpellCheck | null,
  reportEnabled: (on: boolean) => void,
): SpellingCommands => ({
  setEnabled: (on) => {
    api.asc_setSpellCheck(on);
    reportEnabled(on);
  },
  replace: (suggestion) => {
    const word = current();
    if (word) api.asc_replaceMisspelledWord(suggestion, word);
  },
  ignore: (everywhere) => {
    const word = current();
    if (word) api.asc_ignoreMisspelledWord(word, everywhere);
  },
});

/**
 * Follows the misspelled word at the cursor in the editor's state, and gives the commands that act
 * on it. `onFocusObject` registers for asc_onFocusObject, which every text editor sends.
 */
export const connectSpelling = (
  api: SpellingApi,
  onFocusObject: (
    listener: (objects: Array<{ asc_getObjectType(): number; get_ObjectValue?: () => unknown }>) => void,
  ) => void,
  spellCheckType: number,
  dispatch: (event: SpellingEvent) => void,
): SpellingCommands => {
  let current: EngineSpellCheck | null = null;
  onFocusObject((objects) => {
    current = findMisspelled(objects, spellCheckType);
    dispatch({ type: "misspelled", value: readMisspelled(current) });
  });
  return createSpellingCommands(
    api,
    () => current,
    (on) => dispatch({ type: "spellCheck", value: on }),
  );
};

export type SpellingState = { enabled: boolean; misspelled: Misspelled | null };

export const initialSpellingState: SpellingState = { enabled: false, misspelled: null };

export type SpellingEvent =
  | { type: "spellCheck"; value: boolean }
  | { type: "misspelled"; value: Misspelled | null };
