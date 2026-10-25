import { createHash, randomBytes } from "node:crypto";
import type { AccessToken, CreateAccessToken, TokenScope } from "@schreibzeug/files-api";
import { and, desc, eq } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type AccessTokenRow, accessTokens, user } from "../db/schema";
import { fail, ok, type Result } from "../result";
import type { SessionUser } from "./auth";

/** Every token starts like this, so a leaked one is recognisable (e.g. by secret scanners). */
export const TOKEN_PREFIX = "sz_";

const DAY = 86_400_000;

/**
 * A token has 32 random bytes; that is too much to guess, so a plain SHA-256 is enough to keep it
 * (a slow password hash protects guessable secrets, which this is not).
 */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const toAccessToken = (row: AccessTokenRow): AccessToken => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
});

/** A new token for the user; the token is in the answer this once and nowhere else. */
export const createToken = (
  db: Queryable,
  userId: string,
  input: CreateAccessToken,
  now = Date.now(),
): { row: AccessTokenRow; token: string } => {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = db
    .insert(accessTokens)
    .values({
      userId,
      name: input.name,
      scope: input.scope,
      hash: hashToken(token),
      createdAt: new Date(now),
      expiresAt: input.days === null ? null : new Date(now + input.days * DAY),
    })
    .returning()
    .get();
  return { row, token };
};

/** The user's tokens, newest first. */
export const listTokens = (db: Queryable, userId: string): AccessTokenRow[] =>
  db
    .select()
    .from(accessTokens)
    .where(eq(accessTokens.userId, userId))
    .orderBy(desc(accessTokens.createdAt))
    .all();

/** Revokes one of the user's tokens; someone else's is "not found". */
export const revokeToken = (db: Queryable, userId: string, id: string): Result<null> => {
  const removed = db
    .delete(accessTokens)
    .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, userId)))
    .returning({ id: accessTokens.id })
    .get();
  return removed ? ok(null) : fail("not_found", "Diesen Schlüssel gibt es nicht.");
};

/** Who a request with this token acts for, and how far; the token's name says through what. */
export type TokenAccess = { user: SessionUser; tokenId: string; tokenName: string; scope: TokenScope };

/** The user behind a token that holds, noting that it was used; null for anything else. */
export const verifyToken = (db: Queryable, token: string, now = Date.now()): TokenAccess | null => {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const found = db
    .select({ token: accessTokens, user: { id: user.id, name: user.name, email: user.email } })
    .from(accessTokens)
    .innerJoin(user, eq(user.id, accessTokens.userId))
    .where(eq(accessTokens.hash, hashToken(token)))
    .get();
  if (!found) return null;
  if (found.token.expiresAt && found.token.expiresAt.getTime() <= now) return null;
  db.update(accessTokens)
    .set({ lastUsedAt: new Date(now) })
    .where(eq(accessTokens.id, found.token.id))
    .run();
  return { user: found.user, tokenId: found.token.id, tokenName: found.token.name, scope: found.token.scope };
};
