import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

/**
 * The local server listens on 127.0.0.1 only, and still every program and every web page in the
 * browser could reach it. So it answers only those who have the token the desktop app made at
 * start: the app opens `/api/local/unlock?token=…` once, which leaves a cookie for this address.
 *
 * - The cookie is SameSite=Strict: a request from another site does not carry it (CSRF).
 * - The Host must be a loopback name: a foreign name pointing at 127.0.0.1 (DNS rebinding) is
 *   turned away even before the cookie is looked at.
 * - A request that changes something must come from a loopback page (Origin), as must a WebSocket.
 */
export const COOKIE = "stapel_local";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const hostnameOf = (host: string | undefined): string | null => {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
};

export const isLoopback = (host: string | undefined): boolean => {
  const name = hostnameOf(host);
  return name !== null && LOOPBACK_HOSTS.has(name);
};

const originIsLoopback = (origin: string | undefined): boolean => {
  if (origin === undefined) return true;
  try {
    return isLoopback(new URL(origin).host);
  } catch {
    return false;
  }
};

/** The Host the request was made to; Bun builds the request's URL from it. */
const hostOf = (c: Context): string => c.req.header("host") ?? new URL(c.req.url).host;

const same = (a: string, b: string) => {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const refuse = (c: Context, status: 401 | 403, message: string) =>
  c.json(
    { error: { kind: status === 401 ? ("unauthorized" as const) : ("forbidden" as const), message } },
    status,
  );

/** Lets through only requests for this computer, from it, with the token's cookie. */
export const requireToken = (token: string) =>
  createMiddleware(async (c, next) => {
    if (!isLoopback(hostOf(c))) return refuse(c, 403, "Nur von diesem Computer aus.");
    const changes = !SAFE_METHODS.has(c.req.method) || c.req.header("upgrade") !== undefined;
    if (changes && !originIsLoopback(c.req.header("origin")))
      return refuse(c, 403, "Nur von diesem Computer aus.");
    const cookie = getCookie(c, COOKIE);
    if (!cookie || !same(cookie, token)) return refuse(c, 401, "Bitte öffne Stapel über die Desktop-App.");
    await next();
  });

/** `/api/local/unlock?token=…`: sets the cookie and goes on to the app (or `to`, a local path). */
export const unlock = (token: string) => (c: Context) => {
  if (!isLoopback(hostOf(c))) return refuse(c, 403, "Nur von diesem Computer aus.");
  if (!same(c.req.query("token") ?? "", token)) return refuse(c, 401, "Der Schlüssel stimmt nicht.");
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: "Strict", path: "/" });
  const to = c.req.query("to") ?? "/";
  return c.redirect(to.startsWith("/") && !to.startsWith("//") ? to : "/");
};
