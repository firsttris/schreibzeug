import type { Share, ShareRole } from "@stapel/files-api";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nodes, shares, user } from "../db/schema";
import { fail, ok, type Result } from "../result";
import { requireRole, type UserId } from "./access";

const NO_ACCOUNT = "Kein Konto mit dieser E-Mail.";

/** Who a node is shared with, by name as a person reads it (SQLite's lower() knows only ASCII). */
const listOf = (db: Queryable, nodeId: string): Share[] =>
  db
    .select({ userId: shares.userId, name: user.name, email: user.email, role: shares.role })
    .from(shares)
    .innerJoin(user, eq(user.id, shares.userId))
    .where(eq(shares.nodeId, nodeId))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

/** Who a node is shared with; only its owner may ask. */
export const listShares = (db: Queryable, owner: UserId, nodeId: string): Result<Share[]> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  return ok(listOf(db, nodeId));
};

/**
 * Shares a node with the account behind an e-mail address, or changes the role it has. The person
 * must have an account: there are no invitations yet. `email` comes lowercased (putShareSchema).
 */
export const putShare = (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  input: { email: string; role: ShareRole },
): Result<Share[]> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  const grantee = db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, input.email))
    .get();
  if (!grantee) return fail("not_found", NO_ACCOUNT);
  if (grantee.id === owner) return fail("invalid", "Das gehört dir schon.");
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
  db.delete(shares)
    .where(and(eq(shares.nodeId, nodeId), eq(shares.userId, userId)))
    .run();
  return ok(listOf(db, nodeId));
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
