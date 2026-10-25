import { z } from "zod";

/**
 * Schreibzeug inside Kontext: Kontext shows it in a frame, as its module "Dokumente". Both talk
 * with `postMessage`, and only with each other: a message counts only from the parent window at the
 * origin the server names (`embedOrigin` in /api/info), and goes only to that origin. Kontext keeps
 * the same shapes on its side (src/features/documents/messages.ts in firsttris/kontext).
 */

/** The query parameter Kontext opens the frame with: `?embedded=kontext`. */
export const EMBED_PARAM = "embedded";
export const EMBED_VALUE = "kontext";

/** What Schreibzeug tells Kontext. */
export type OutgoingMessage =
  | { source: "schreibzeug"; type: "ready" }
  /** The page shown: a path of the app (`/folders/…`, `/edit/…`), and the document's name there. */
  | { source: "schreibzeug"; type: "route"; path: string }
  | { source: "schreibzeug"; type: "title"; title: string | null }
  /** Changes the server does not have yet; Kontext marks the module while there are some. */
  | { source: "schreibzeug"; type: "unsaved"; unsaved: boolean }
  /** A key for Kontext (its 1–6 for the modules), pressed outside a field and the document. */
  | { source: "schreibzeug"; type: "shortcut"; key: string }
  /** The answer to Kontext's sign-out: Schreibzeug's session is gone too. */
  | { source: "schreibzeug"; type: "signed-out" };

const incomingSchema = z.discriminatedUnion("type", [
  z.object({ source: z.literal("kontext"), type: z.literal("theme"), theme: z.enum(["light", "dark"]) }),
  /** Open a page of the app: the back button in Kontext, a link from the chat. */
  z.object({ source: z.literal("kontext"), type: z.literal("navigate"), path: z.string() }),
  /** Kontext signed out: so does Schreibzeug. */
  z.object({ source: z.literal("kontext"), type: z.literal("logout") }),
]);

export type IncomingMessage = z.infer<typeof incomingSchema>;

/** A message from Kontext, or null for anything else (another origin, another window, another shape). */
export const readMessage = (
  event: { origin: string; source: unknown; data: unknown },
  expected: { origin: string; parent: unknown },
): IncomingMessage | null => {
  if (event.origin !== expected.origin || event.source !== expected.parent) return null;
  const parsed = incomingSchema.safeParse(event.data);
  return parsed.success ? parsed.data : null;
};

/** Any origin will do: only whether the path leaves it matters. */
const PROBE_ORIGIN = "https://schreibzeug.invalid";

/**
 * A path of this app only, never another site: `/edit/…`, not `//evil.example` or `https://…`.
 * The URL parser decides, since it also reads `/\evil.example`, or `/` and `/evil.example` with a
 * tab between them, as another host (for http(s) a backslash counts as a slash and tabs are
 * dropped: WHATWG URL Standard, "basic URL parser").
 */
export const isAppPath = (path: string): boolean => {
  if (!path.startsWith("/")) return false;
  try {
    return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
};

/**
 * Whether Schreibzeug runs embedded: opened in a frame, by the one origin that may embed it, with
 * `?embedded=kontext` on the first page or remembered from it for this frame (`remembered`).
 */
export const isEmbedded = (facts: {
  search: string;
  remembered: boolean;
  inFrame: boolean;
  embedOrigin: string | undefined;
}): boolean =>
  Boolean(facts.embedOrigin) &&
  facts.inFrame &&
  (facts.remembered || new URLSearchParams(facts.search).get(EMBED_PARAM) === EMBED_VALUE);

/** Keys Kontext uses for itself that Schreibzeug passes on: the modules (1–9) and "?" for help. */
export const isKontextShortcut = (event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean => !event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9?]$/.test(event.key);
