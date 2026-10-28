import type { SpellingCommands, SpellingState } from "@schreibzeug/editor-core";
import { m } from "../paraglide/messages";
import { writeSpellCheck } from "../settings/spell-check";
import type { MenuItem } from "../ui/menu";

/** How many suggestions the context menu lists, as web-apps' (DocumentHolder.js, at most a few). */
const MAX_SUGGESTIONS = 5;

/** The setting in "Überprüfen": red underlines on or off, remembered in this browser. */
export const spellCheckItem = (
  spelling: SpellingState,
  commands: SpellingCommands | null,
  off: boolean,
): MenuItem => ({
  label: m.spelling_menus_spell_check(),
  checked: spelling.enabled,
  disabled: off || !commands,
  onSelect: () => {
    const on = !spelling.enabled;
    commands?.setEnabled(on);
    writeSpellCheck(on);
  },
});

/**
 * The suggestions for the misspelled word at the cursor, then ignoring it here or everywhere, first
 * in the context menu as in web-apps (documenteditor main DocumentHolderExt.js spellProps).
 */
export const suggestionGroups = (
  spelling: SpellingState,
  commands: SpellingCommands | null,
): MenuItem[][] => {
  const { misspelled } = spelling;
  if (!misspelled || !commands || !spelling.enabled) return [];
  const suggestions: MenuItem[] = misspelled.suggestions.slice(0, MAX_SUGGESTIONS).map((suggestion) => ({
    label: suggestion,
    onSelect: () => commands.replace(suggestion),
  }));
  return [
    suggestions.length > 0
      ? suggestions
      : [{ label: m.spelling_menus_no_suggestions(), disabled: true, onSelect: () => {} }],
    [
      { label: m.spelling_menus_ignore(), onSelect: () => commands.ignore(false) },
      { label: m.spelling_menus_ignore_all(), onSelect: () => commands.ignore(true) },
    ],
  ];
};
