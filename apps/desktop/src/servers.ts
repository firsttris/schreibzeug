/**
 * The servers the desktop app connects to. Pure functions over the stored list; the page in main.ts
 * reads and writes it. The window then shows the server's own web app (apps/server SCHREIBZEUG_WEB_DIR).
 */

export const MAX_RECENT = 5;

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/i;

/**
 * The address typed in, as a URL to open: without a scheme, https for a server on the internet and
 * http for one on this machine or in the local network, where servers rarely have a certificate.
 * Only http and https are opened; null for anything else.
 */
export const serverUrl = (input: string): string | null => {
  const typed = input.trim().replace(/\/+$/, "");
  if (!typed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed)
    ? typed
    : `${LOCAL_HOST.test(typed.split("/")[0] ?? "") ? "http" : "https"}://${typed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return null;
  }
};

/** The server used last comes first; each one once; a few at most. */
export const remember = (recent: readonly string[], url: string): string[] =>
  [url, ...recent.filter((other) => other !== url)].slice(0, MAX_RECENT);

/** The stored list, whatever was stored: only strings that are server addresses. */
export const readRecent = (stored: string | null): string[] => {
  try {
    const parsed: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && serverUrl(entry) === entry)
      : [];
  } catch {
    return [];
  }
};
