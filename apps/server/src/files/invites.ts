import { randomBytes } from "node:crypto";
import type { CreateInvite } from "@schreibzeug/files-api";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type InviteRow, invites, type NodeRow, nodes, shares, user } from "../db/schema";
import { fail, ok, type Result } from "../result";
import { type Accessible, requireRole, roleOf, type UserId } from "./access";

const INVALID = "Diese Einladung gilt nicht mehr.";
const DAY = 24 * 60 * 60 * 1000;

/** 24 random bytes: a link nobody guesses. */
const newToken = (): string => randomBytes(24).toString("base64url");

/** The links of a node that still hold; only its owner may ask. */
export const listInvites = (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  now = new Date(),
): Result<InviteRow[]> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  return ok(
    db
      .select()
      .from(invites)
      .where(and(eq(invites.nodeId, nodeId), gt(invites.expiresAt, now)))
      .orderBy(asc(invites.createdAt))
      .all(),
  );
};

export const createInvite = (
  db: Queryable,
  owner: UserId,
  nodeId: string,
  input: CreateInvite,
  now = new Date(),
): Result<InviteRow> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  const invite = db
    .insert(invites)
    .values({
      token: newToken(),
      nodeId,
      role: input.role,
      createdBy: owner,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.days * DAY),
    })
    .returning()
    .get();
  return ok(invite);
};

export const removeInvite = (db: Queryable, owner: UserId, nodeId: string, token: string): Result<null> => {
  const access = requireRole(db, owner, nodeId, "owner");
  if (!access.ok) return access;
  db.delete(invites)
    .where(and(eq(invites.nodeId, nodeId), eq(invites.token, token)))
    .run();
  return ok(null);
};

export type Invitation = { invite: InviteRow; node: NodeRow; ownerName: string };

/** A link that still holds, for a node outside the trash, with whose node it is. */
export const findInvitation = (db: Queryable, token: string, now = new Date()): Result<Invitation> => {
  const found = db
    .select({ invite: invites, node: nodes, ownerName: user.name })
    .from(invites)
    .innerJoin(nodes, eq(nodes.id, invites.nodeId))
    .innerJoin(user, eq(user.id, nodes.ownerId))
    .where(and(eq(invites.token, token), gt(invites.expiresAt, now), isNull(nodes.trashedAt)))
    .get();
  return found ? ok(found) : fail("not_found", INVALID);
};

/**
 * Accepts a link: the user gets a share with its role, or keeps a stronger one they already have.
 * The owner accepting their own link changes nothing. Answers with the node as the user may now
 * use it.
 */
export const acceptInvite = (
  db: Queryable,
  me: UserId,
  token: string,
  now = new Date(),
): Result<Accessible> => {
  const found = findInvitation(db, token, now);
  if (!found.ok) return found;
  const { invite, node } = found.value;
  if (node.ownerId !== me) {
    const held = db
      .select({ role: shares.role })
      .from(shares)
      .where(and(eq(shares.nodeId, node.id), eq(shares.userId, me)))
      .get();
    const role = held?.role === "edit" ? "edit" : invite.role;
    db.insert(shares)
      .values({ nodeId: node.id, userId: me, role })
      .onConflictDoUpdate({ target: [shares.nodeId, shares.userId], set: { role } })
      .run();
  }
  const access = roleOf(db, me, node.id);
  return access ? ok(access) : fail("not_found", INVALID);
};
