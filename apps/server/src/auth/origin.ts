import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./middleware";

const READING = new Set(["GET", "HEAD", "OPTIONS"]);

const isWebSocketUpgrade = (headers: Headers) => headers.get("upgrade")?.toLowerCase() === "websocket";

/**
 * Whether a request comes from a page of this server or of an origin it trusts. The server's own
 * origin is the one the request was sent to, as Better Auth takes it for its own check
 * (api/middlewares/origin-check.mjs). Without an `Origin` header, the browser's `Sec-Fetch-Site`
 * decides; a request with neither comes from no browser page (a script, the tests).
 */
export const fromTrustedOrigin = (request: Request, trusted: readonly string[]): boolean => {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin || trusted.includes(origin);
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
};

/**
 * Cookies are `SameSite=Lax`: a page on another origin of the same site (another subdomain beside
 * Kontext, another port of the host) still sends them with a form, a `fetch` or a WebSocket. So what
 * changes something with a session, and the WebSocket upgrades of the relay and the editor jobs,
 * must come from this server's pages or a trusted origin (`SCHREIBZEUG_URL`,
 * `SCHREIBZEUG_TRUSTED_ORIGINS`); anything else gets 403. A token is not sent by the browser on its
 * own, so requests with one are not checked.
 */
export const requireTrustedOrigin = (trusted: readonly string[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const changes = !READING.has(c.req.method) || isWebSocketUpgrade(c.req.raw.headers);
    if (c.var.via !== "session" || !changes || fromTrustedOrigin(c.req.raw, trusted)) return next();
    return c.json(
      { error: { kind: "forbidden" as const, message: "Diese Anfrage kommt nicht von Schreibzeug." } },
      403,
    );
  });
