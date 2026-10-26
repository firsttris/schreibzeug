import type { Share, ShareRole } from "@schreibzeug/files-api";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nodes, pendingShares, shares, user } from "../db/schema";
import { fail, ok, type Result } from "../result";
import { requireRole, type UserId } from "./access";

const NO_ACCOUNT = "Kein Konto mit dieser E-Mail.";

/** The id a share with an address without an account goes by (to remove it). */
const PENDING = "pending:";

const hasShare = (db: Queryable, nodeId: string, userId: UserId) =>
  db
    .select({ userId: shares.userId })
    .from(shares)
    .where(and(eq(shares.nodeId, nodeId), eq(shares.userId, userId)))
    .get() !== undefined;

/**
 * Who a node is shared with, by name as a person reads it (SQLite's lower() knows only ASCII); then
 * the addresses that have no account yet. An account whose address nobody confirmed is marked
 * (`unverified`): with a password anyone can sign up under any address, so the owner sees that the
 * account is not known to be the person.
 */
const listOf = (db: Queryable, nodeId: string): Share[] => [
  ...db
    .select({
      userId: shares.userId,
      name: user.name,
      email: user.email,
      role: shares.role,
      confirmed: user.emailVerified,
    })
    .from(shares)
    .innerJoin(user, eq(user.id, shares.userId))
    .where(eq(shares.nodeId, nodeId))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map(({ confirmed, ...entry }) => (confirmed ? entry : { ...entry, unverified: true })),
  ...db
    .select({ email: pendingShares.email, role: pendingShares.role })
    .from(pendingShares)
    .where(eq(pendingShares.nodeId, nodeId))
    .orderBy(pendingShares.email)
    .all()
    .map(({ email, role }) => ({ userId: `${PENDING}${email}`, name: email, email, role, pending: true })),
];

/** Who a node is shared with; only its owner may ask. */
export const listShares = (db: Queryable, owner: UserId, nodeId: string): Result<Share[]> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  return ok(listOf(db, nodeId));
};

/**
 * Shares a node with the account behind an e-mail address, or changes the role it has. Without an
 * account the share waits for one (`pending`, only where a sign-in provider confirms addresses,
 * see claimPendingShares; there also while the account's address is unconfirmed); otherwise the
 * person must have an account. `email` comes lowercased (putShareSchema).
 */
export const putShare = (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  input: { email: string; role: ShareRole },
  { pending = false }: { pending?: boolean } = {},
): Result<Share[]> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  const account = db
    .select({ id: user.id, confirmed: user.emailVerified })
    .from(user)
    .where(eq(sql`lower(${user.email})`, input.email))
    .get();
  if (account?.id === owner) return fail("invalid", "Das gehört dir schon.");
  // Where the provider confirms addresses, an account whose address nobody confirmed (a sign-up
  // with a password, maybe under a colleague's address) is not taken for the person: the share waits
  // until the address is confirmed. A share it already has keeps changing in place.
  const grantee =
    account && (!pending || account.confirmed || hasShare(db, nodeId, account.id)) ? account : undefined;
  if (!grantee && !pending) return fail("not_found", NO_ACCOUNT);
  if (!grantee) {
    db.insert(pendingShares)
      .values({ nodeId, email: input.email, role: input.role })
      .onConflictDoUpdate({ target: [pendingShares.nodeId, pendingShares.email], set: { role: input.role } })
      .run();
    return ok(listOf(db, nodeId));
  }
  db.insert(shares)
    .values({ nodeId, userId: grantee.id, role: input.role })
    .onConflictDoUpdate({ target: [shares.nodeId, shares.userId], set: { role: input.role } })
    .run();
  return ok(listOf(db, nodeId));
};

export const removeShare = (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  userId: string,
): Result<Share[]> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  if (userId.startsWith(PENDING)) {
    db.delete(pendingShares)
      .where(and(eq(pendingShares.nodeId, nodeId), eq(pendingShares.email, userId.slice(PENDING.length))))
      .run();
  } else {
    db.delete(shares)
      .where(and(eq(shares.nodeId, nodeId), eq(shares.userId, userId)))
      .run();
  }
  return ok(listOf(db, nodeId));
};

/**
 * Turns the shares waiting for an address into shares of the account that now has it. Only for an
 * address the sign-in provider confirmed (Kontext, auth.ts and bearer.ts): with a password anyone
 * could sign up as anybody's address.
 */
export const claimPendingShares = (db: Queryable, userId: UserId, email: string): void => {
  const address = email.toLowerCase();
  const waiting = db.select().from(pendingShares).where(eq(pendingShares.email, address)).all();
  for (const { nodeId, role } of waiting) {
    db.insert(shares).values({ nodeId, userId, role }).onConflictDoNothing().run();
  }
  db.delete(pendingShares).where(eq(pendingShares.email, address)).run();
};

export type SharedWithMe = { node: NodeRow; role: ShareRole; ownerName: string };

/** What others shared with the user directly, outside the trash, newest share first. */
export const listSharedWithMe = (db: Queryable, me: UserId): SharedWithMe[] =>
  db
    .select({ node: nodes, role: shares.role, ownerName: user.name })
    .from(shares)
    .innerJoin(nodes, eq(nodes.id, shares.nodeId))
    .innerJoin(user, eq(user.id, nodes.ownerId))
    .where(and(eq(shares.userId, me), isNull(nodes.trashedAt)))
    .orderBy(desc(shares.createdAt))
    .all();
