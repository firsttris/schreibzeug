import { EMBED_PARAM, EMBED_VALUE, isEmbedded, type OutgoingMessage } from "./messages";

/** Kept for the frame (sessionStorage is per tab and frame): the first page said `?embedded=kontext`. */
const REMEMBERED = "schreibzeug.embedded";
/** Kept for the frame: a silent sign-in was tried, so a failed one does not loop. */
const SILENT_TRIED = "schreibzeug.silent-sign-in";

/** Storage that may refuse (private windows, blocked frames): then nothing is remembered. */
const storage = {
  get: (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      // Without storage the frame forgets on reload; Kontext opens it with the parameter again.
    }
  },
};

/** A page of the app without the parameter that opened it embedded (it is remembered). */
export const withoutEmbedParam = (href: string): string => {
  const url = new URL(href, "http://app.invalid");
  url.searchParams.delete(EMBED_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};

export type Embed = {
  /** Shown as Kontext's module "Dokumente": no header of its own, messages to Kontext. */
  embedded: boolean;
  /** Kontext's origin, when embedded. */
  origin: string | null;
  post: (message: OutgoingMessage) => void;
  /** Whether a silent sign-in may be tried now; at most once until a session is there. */
  takeSilentSignIn: () => boolean;
  /** A session is there: a later lapse may try the silent sign-in again. */
  signedIn: () => void;
  /** Kontext signed out: no silent sign-in until the frame is opened again. */
  signedOut: () => void;
};

/** Reads once at start whether the app runs in Kontext's frame, and remembers it for the frame. */
export const createEmbed = (embedOrigin: string | undefined, view: Window = window): Embed => {
  const inFrame = view.parent !== view;
  const embedded = isEmbedded({
    search: view.location.search,
    remembered: storage.get(REMEMBERED) === "1",
    inFrame,
    embedOrigin,
  });
  if (embedded) storage.set(REMEMBERED, "1");
  // Kontext opened the frame anew (after its own sign-in, too): a silent sign-in may be tried again.
  if (embedded && new URLSearchParams(view.location.search).get(EMBED_PARAM) === EMBED_VALUE)
    storage.set(SILENT_TRIED, null);
  const origin = embedded && embedOrigin ? embedOrigin : null;
  return {
    embedded,
    origin,
    post: (message) => {
      if (origin) view.parent.postMessage(message, origin);
    },
    takeSilentSignIn: () => {
      if (!embedded || storage.get(SILENT_TRIED)) return false;
      storage.set(SILENT_TRIED, "1");
      return true;
    },
    signedIn: () => storage.set(SILENT_TRIED, null),
    signedOut: () => storage.set(SILENT_TRIED, "1"),
  };
};
