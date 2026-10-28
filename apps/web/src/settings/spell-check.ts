/**
 * Whether the spell checker marks misspelled words: a setting of this browser, on unless switched
 * off, as web-apps keeps it ("settings-spellcheck" in localStorage, common/main ReviewChanges.js
 * onTurnSpelling).
 */
import { browserSetting } from "./browser-setting";

const setting = browserSetting("schreibzeug.spellcheck", true);

export const readSpellCheck = setting.read;
export const writeSpellCheck = setting.write;
