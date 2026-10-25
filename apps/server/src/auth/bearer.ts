import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { Database } from "../db/database";
import { account, user } from "../db/schema";
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
 */
export type BearerDeps = {
  db: Database;
  /** The provider's issuer (OIDC_ISSUER). */
  issuer: string;
  /** This server's address (SCHREIBZEUG_URL), the audience the tokens name. */
  audience: string;
  /** The provider id the sign-in keeps accounts under (auth.ts OIDC_PROVIDER). */
  providerId: string;
  /** The provider's keys; by default read from its discovery document. */
  keys?: Parameters<typeof jwtVerify>[1];
};

type Claims = JWTPayload & { email?: unknown; name?: unknown };

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

/** The person behind a provider's subject: by the linked account, else by address, else new. */
const personOf = (db: Database, providerId: string, subject: string, email: string, name: string) =>
  db.transaction((tx): SessionUser => {
    const linked = tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(account)
      .innerJoin(user, eq(user.id, account.userId))
      .where(and(eq(account.providerId, providerId), eq(account.accountId, subject)))
      .get();
    if (linked) return linked;
    const now = new Date();
    const known = tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.email, email))
      .get();
    const person = known ?? { id: crypto.randomUUID(), name, email };
    if (!known) {
      tx.insert(user)
        .values({ ...person, emailVerified: true, createdAt: now, updatedAt: now })
        .run();
      // The provider vouches for the address: what was shared with it is theirs now.
      claimPendingShares(tx, person.id, email);
    }
    tx.insert(account)
      .values({
        id: crypto.randomUUID(),
        accountId: subject,
        providerId,
        userId: person.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return person;
  });

/** Checks a bearer token; the person it is for, or null for a token that does not hold. */
export const createBearer =
  ({ db, issuer, audience, providerId, keys = discoveredKeys(issuer) }: BearerDeps) =>
  async (token: string): Promise<SessionUser | null> => {
    const verified = await jwtVerify<Claims>(token, keys, { issuer, audience }).catch(() => null);
    const claims = verified?.payload;
    if (!claims?.sub || typeof claims.email !== "string") return null;
    const email = claims.email.toLowerCase();
    const name = typeof claims.name === "string" && claims.name ? claims.name : email;
    return personOf(db, providerId, claims.sub, email, name);
  };

export type Bearer = ReturnType<typeof createBearer>;
