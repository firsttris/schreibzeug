import { and, count, eq } from "drizzle-orm";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { Database } from "../db/database";
import { accessTokens, account, session, user } from "../db/schema";
import { adoptOwnerless } from "../files/repository";
import { claimPendingShares } from "../files/shares";
import type { SessionUser } from "./auth";

/**
 * Requests from another service on someone's behalf (Kontext putting a mail's attachment into
 * Dokumente, or attaching a document to a mail): `Authorization: Bearer <token>`, a short-lived JWT
 * the sign-in provider signed for this server. It counts with the rights of the person it names,
 * no more.
 *
 * The token must come from the provider's keys (its JWKS), name the provider as issuer and this
 * server's address as audience; an id token names the client id instead and is refused. The person
 * is found by the provider's `sub`, as the sign-in keeps them (better-auth: account.accountId), or
 * by their address; someone the provider vouches for and who never signed in here gets an account,
 * like on their first sign-in through it.
 *
 * By address only under Better Auth's own rule for linking (oauth2/link-account.mjs
 * handleOAuthUserInfo, `requireLocalEmailVerified`): the account's address must be confirmed, and
 * the token must confirm it too (`email_verified: true`). An account someone registered with a
 * password under a colleague's address never gets that colleague's identity, and an account the
 * provider knows under another subject (an address given to someone new) is not handed on. Such a
 * token is refused, as Better Auth refuses the sign-in. Without `email_verified: true` a new
 * account's address stays unconfirmed and gets nothing that was shared with it.
 */
export type BearerDeps = {
  db: Database;
  /** The provider's issuer (OIDC_ISSUER). */
  issuer: string;
  /** This server's address (SCHREIBZEUG_URL), the audience the tokens name. */
  audience: string;
  /** This server's client id at the provider (OIDC_CLIENT_ID): a token made for another client is refused. */
  clientId: string;
  /** The provider id the sign-in keeps accounts under (auth.ts OIDC_PROVIDER). */
  providerId: string;
  /** The provider's keys; by default read from its discovery document. */
  keys?: Parameters<typeof jwtVerify>[1];
};

type Claims = JWTPayload & {
  email?: unknown;
  name?: unknown;
  email_verified?: unknown;
  azp?: unknown;
  client_id?: unknown;
};

/**
 * What a token must be to hold: signed with the provider's private key (no `HS*` or `none`, which a
 * key set could be talked into), with an expiry, and not older than this, whatever its `exp` says.
 * Kontext's tokens last five minutes (server/documents/schreibzeug.ts in Kontext).
 */
const VERIFY = {
  algorithms: [
    "EdDSA",
    "Ed25519",
    "ES256",
    "ES384",
    "ES512",
    "RS256",
    "RS384",
    "RS512",
    "PS256",
    "PS384",
    "PS512",
  ],
  requiredClaims: ["exp", "iat", "sub"],
  maxTokenAge: "10m",
};

/** A token names the client it was made for in `azp` or `client_id`, if at all: it must be this one. */
const madeFor = (claims: Claims, clientId: string) =>
  [claims.azp, claims.client_id].every((client) => client === undefined || client === clientId);

/** The provider's keys, found through its discovery document (read once, again after a failure). */
const discoveredKeys = (issuer: string) => {
  let keys: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;
  const load = async () => {
    const reply = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!reply.ok) throw new Error(`Discovery: ${reply.status}`);
    const { jwks_uri } = (await reply.json()) as { jwks_uri: string };
    return createRemoteJWKSet(new URL(jwks_uri));
  };
  return async (...args: Parameters<ReturnType<typeof createRemoteJWKSet>>) => {
    keys ??= load().catch((error: unknown) => {
      keys = null;
      throw error;
    });
    return (await keys)(...args);
  };
};

/**
 * The person behind a provider's subject: by the linked account, else by address, else new. By
 * address only when the provider confirms it (`verified`, the token's `email_verified: true`); a
 * new account has its address confirmed, and gets what was shared with it, only then too.
 */
const personOf = (
  db: Database,
  providerId: string,
  subject: string,
  email: string,
  name: string,
  create: boolean,
  verified = false,
) =>
  db.transaction((tx): SessionUser | null => {
    const linked = tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(account)
      .innerJoin(user, eq(user.id, account.userId))
      .where(and(eq(account.providerId, providerId), eq(account.accountId, subject)))
      .get();
    if (linked || !create) return linked ?? null;
    const now = new Date();
    const link = (userId: string) =>
      tx
        .insert(account)
        .values({
          id: crypto.randomUUID(),
          accountId: subject,
          providerId,
          userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    const known = tx
      .select({ id: user.id, name: user.name, email: user.email, verified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .get();
    if (known) {
      const elsewhere = tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, known.id), eq(account.providerId, providerId)))
        .get();
      if (!verified || !known.verified || elsewhere) return null;
      link(known.id);
      claimPendingShares(tx, known.id, email);
      return { id: known.id, name: known.name, email: known.email };
    }
    const person = { id: crypto.randomUUID(), name, email };
    tx.insert(user)
      .values({ ...person, emailVerified: verified, createdAt: now, updatedAt: now })
      .run();
    link(person.id);
    // As at a sign-up (auth.ts): the first account takes over the files from before accounts, and
    // the address the provider vouches for gets what was shared with it.
    if ((tx.select({ value: count() }).from(user).get()?.value ?? 0) === 1) adoptOwnerless(tx, person.id);
    if (verified) claimPendingShares(tx, person.id, email);
    return person;
  });

/** The verified claims of a token: who it is for, or null for a token that does not hold. */
const claimsOf = async (
  token: string,
  {
    issuer,
    audience,
    clientId,
    keys,
  }: Required<Pick<BearerDeps, "issuer" | "audience" | "clientId" | "keys">>,
) => {
  const verified = await jwtVerify<Claims>(token, keys, { issuer, audience, ...VERIFY }).catch(() => null);
  const claims = verified?.payload;
  if (!claims?.sub || typeof claims.email !== "string" || !madeFor(claims, clientId)) return null;
  const email = claims.email.toLowerCase();
  const name = typeof claims.name === "string" && claims.name ? claims.name : email;
  return { subject: claims.sub, email, name, verified: claims.email_verified === true };
};

/**
 * Tokens from the sign-in provider: `person` checks one and gives the person it is for (null for a
 * token that does not hold), `endSessions` signs that person out everywhere here, their personal
 * access tokens included (Kontext, when someone leaves or is locked): "ended", "unknown" for someone without an account here (none is
 * made for that), or "refused".
 */
export const createBearer = ({
  db,
  issuer,
  audience,
  clientId,
  providerId,
  keys = discoveredKeys(issuer),
}: BearerDeps) => {
  const check = { issuer, audience, clientId, keys };
  return {
    person: async (token: string): Promise<SessionUser | null> => {
      const claims = await claimsOf(token, check);
      return (
        claims && personOf(db, providerId, claims.subject, claims.email, claims.name, true, claims.verified)
      );
    },
    endSessions: async (token: string): Promise<"ended" | "unknown" | "refused"> => {
      const claims = await claimsOf(token, check);
      if (!claims) return "refused";
      const person = personOf(db, providerId, claims.subject, claims.email, claims.name, false);
      if (!person) return "unknown";
      // Signed out everywhere: the personal access tokens (tokens.ts) end with the sessions.
      db.transaction((tx) => {
        tx.delete(session).where(eq(session.userId, person.id)).run();
        tx.delete(accessTokens).where(eq(accessTokens.userId, person.id)).run();
      });
      return "ended";
    },
  };
};

export type Bearer = ReturnType<typeof createBearer>;
