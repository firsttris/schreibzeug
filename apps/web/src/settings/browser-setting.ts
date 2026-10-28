/**
 * A switch remembered in this browser, as web-apps keeps its settings in localStorage. Storage may
 * be missing or refuse (private windows); then the switch has its default and a change holds for
 * the open document only.
 */
type Reading = Pick<Storage, "getItem"> | null;
type Writing = Pick<Storage, "setItem"> | null;

export const browserSetting = (key: string, fallback: boolean) => ({
  read: (storage: Reading = globalStorage()): boolean => {
    try {
      return storage?.getItem(key) === (fallback ? "off" : "on") ? !fallback : fallback;
    } catch {
      return fallback;
    }
  },
  write: (on: boolean, storage: Writing = globalStorage()): void => {
    try {
      storage?.setItem(key, on ? "on" : "off");
    } catch {
      // Kept for this document only.
    }
  },
});

function globalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
