import { m } from "../paraglide/messages";

/** The key names that differ between the languages, as the keyboard labels them. */
const KEY_NAMES: Record<string, () => string> = {
  Ctrl: m.key_ctrl,
  Shift: m.key_shift,
  Space: m.key_space,
  Del: m.key_delete,
  Arrow: m.key_arrow,
};

/**
 * A shortcut as the interface shows it, written with English key names ("Ctrl+Shift+Z"): German
 * keyboards say "Strg+Umschalt+Z".
 */
export const keys = (shortcut: string): string =>
  shortcut.replace(/\b(Ctrl|Shift|Space|Del|Arrow)\b/g, (name) => KEY_NAMES[name]?.() ?? name);
