import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Database } from "../db/database";
import { type Auth, type SessionUser, sessionUser } from "./auth";
import type { Bearer } from "./bearer";
import { TOKEN_PREFIX, type TokenAccess, verifyToken } from "./tokens";

/** How a request was signed in: a session cookie, a personal access token, or the sign-in provider. */
export type SignedInBy = "session" | "token" | "provider";

/**
 * What routes behind `requireUser` find on the context: the user, how they signed in, and the
 * personal access token the request came with, if it came with one.
 */
export type AuthEnv = { Variables: { user: SessionUser; via?: SignedInBy; token?: TokenAccess } };

const BEARER = /^Bearer\s+(\S+)$/i;

/** The bearer token a request carries, if any. */
export const bearerToken = (headers: Headers): string | undefined =>
  headers.get("authorization")?.match(BEARER)?.[1];

const READING = new Set(["GET", "HEAD", "OPTIONS"]);

const refuse = (c: Context, status: 401 | 403, message: string) =>
  c.json(
    { error: { kind: status === 401 ? ("unauthorized" as const) : ("forbidden" as const), message } },
    status,
    status === 401 ? { "www-authenticate": 'Bearer realm="schreibzeug"' } : {},
  );

/**
 * Lets a request through with a session, a personal access token (tokens.ts, "sz_…"), or a token
 * from the sign-in provider (bearer.ts) when the server has one; its user is `c.var.user` from then
 * on. A personal access token is judged by itself alone: a wrong one is refused, not taken as a
 * request without one. A "read" token only reads.
 */
export const requireUser = (auth: Auth, db: Database, bearer?: Bearer) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const token = bearerToken(c.req.raw.headers);
    if (token?.startsWith(TOKEN_PREFIX)) {
      const access = verifyToken(db, token);
      if (!access) return refuse(c, 401, "Der Zugangsschlüssel gilt nicht (mehr).");
      if (access.scope === "read" && !READING.has(c.req.method)) {
        return refuse(c, 403, "Dieser Zugangsschlüssel darf nur lesen.");
      }
      c.set("user", access.user);
      c.set("via", "token");
      c.set("token", access);
      return next();
    }
    const byProvider = Boolean(bearer && token);
    const user = bearer && token ? await bearer.person(token) : await sessionUser(auth, c.req.raw.headers);
    if (!user) return refuse(c, 401, "Bitte melde dich an.");
    c.set("user", user);
    c.set("via", byProvider ? "provider" : "session");
    await next();
  });

/**
 * For what only the person themselves may do, in the app with a session: managing tokens, joining
 * a live session, taking jobs for an open document. Neither a personal access token nor a token
 * the sign-in provider sends on someone's behalf will do: else a five-minute token from Kontext
 * could make a lasting one.
 */
export const requireSession = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.var.via !== "session")
    return refuse(c, 403, "Das geht nur angemeldet in der App, nicht mit einem Zugangsschlüssel.");
  await next();
});

/**
 * For what a "read" token must not reach although it only reads: the secrets of links, which would
 * let another account edit what the token may only look at.
 */
export const refuseReadToken = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.var.token?.scope === "read") return refuse(c, 403, "Dieser Zugangsschlüssel darf nur lesen.");
  await next();
});
