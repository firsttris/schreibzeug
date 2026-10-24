import type { Share, ShareRole } from "@stapel/files-api";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nodes, shares, user } from "../db/schema";
import { fail, ok, type Result } from "../result";
import { requireRole, type UserId } from "./access";

const NO_ACCOUNT = "Kein Konto mit dieser E-Mail.";

const listOf = (db: Queryable, nodeId: string): Promise<Share[]> =>
  db
    .select({ userId: shares.userId, name: user.name, email: user.email, role: shares.role })
    .from(shares)
    .innerJoin(user, eq(user.id, shares.userId))
    .where(eq(shares.nodeId, nodeId))
    .orderBy(asc(sql`lower(${user.name})`));

/** Who a node is shared with; only its owner may ask. */
export const listShares = async (db: Queryable, owner: UserId, nodeId: string): Promise<Result<Share[]>> => {
  const access = await requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  return ok(await listOf(db, nodeId));
};

/**
 * Shares a node with the account behind an e-mail address, or changes the role it has. The person
 * must have an account: there are no invitations yet.
 */
export const putShare = async (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  input: { email: string; role: ShareRole },
): Promise<Result<Share[]>> => {
  const access = await requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  const [grantee] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, input.email));
  if (!grantee) return fail("not_found", NO_ACCOUNT);
  if (grantee.id === owner) return fail("invalid", "Das gehört dir schon.");
  await db
    .insert(shares)
    .values({ nodeId, userId: grantee.id, role: input.role })
    .onConflictDoUpdate({ target: [shares.nodeId, shares.userId], set: { role: input.role } });
  return ok(await listOf(db, nodeId));
};

export const removeShare = async (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  userId: string,
): Promise<Result<Share[]>> => {
  const access = await requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  await db.delete(shares).where(and(eq(shares.nodeId, nodeId), eq(shares.userId, userId)));
  return ok(await listOf(db, nodeId));
};

export type SharedWithMe = { node: NodeRow; role: ShareRole; ownerName: string };

/** What others shared with the user directly, outside the trash, newest share first. */
export const listSharedWithMe = async (db: Queryable, me: UserId): Promise<SharedWithMe[]> =>
  db
    .select({ node: nodes, role: shares.role, ownerName: user.name })
    .from(shares)
    .innerJoin(nodes, eq(nodes.id, shares.nodeId))
    .innerJoin(user, eq(user.id, nodes.ownerId))
    .where(and(eq(shares.userId, me), isNull(nodes.trashedAt)))
    .orderBy(desc(shares.createdAt));
