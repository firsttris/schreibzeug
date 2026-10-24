/**
 * Whether the spell checker marks misspelled words: a setting of this browser, on unless switched
 * off, as web-apps keeps it ("settings-spellcheck" in localStorage, common/main ReviewChanges.js
 * onTurnSpelling). Storage may be missing or refuse (private windows); then it stays on.
 */
const KEY = "schreibzeug.spellcheck";

export const readSpellCheck = (storage: Pick<Storage, "getItem"> | null = globalStorage()): boolean => {
  try {
    return storage?.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

export const writeSpellCheck = (on: boolean, storage: Pick<Storage, "setItem"> | null = globalStorage()) => {
  try {
    storage?.setItem(KEY, on ? "on" : "off");
  } catch {
    // Kept for this document only.
  }
};

function globalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
