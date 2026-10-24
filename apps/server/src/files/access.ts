import type { Role } from "@stapel/files-api";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nodes, shares } from "../db/schema";
import { fail, ok, type Result } from "../result";

/** The signed-in user's id: every call acts for someone. */
export type UserId = string;

export const NOT_FOUND = "Die Datei oder der Ordner existiert nicht.";

const RANK: Record<Role, number> = { view: 1, edit: 2, owner: 3 };

/** The stronger of two roles. */
export const strongest = (a: Role, b: Role): Role => (RANK[a] >= RANK[b] ? a : b);

/** Whether `role` allows what `needed` stands for. */
export const allows = (role: Role, needed: Role): boolean => RANK[role] >= RANK[needed];

/** A node with what the user may do with it. */
export type Accessible = { node: NodeRow; role: Role };

const active = isNull(nodes.trashedAt);

/**
 * The user's role on a node outside the trash: owner, or the strongest share on the node or on any
 * folder above it; null when there is none. The chain of folders is read in one query.
 */
export const roleOf = async (db: Queryable, user: UserId, id: string): Promise<Accessible | null> => {
  const [node] = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, id), active));
  if (!node) return null;
  if (node.ownerId === user) return { node, role: "owner" };
  const [row] = await db.execute<{ role: "edit" | "view" | null }>(sql`
    with recursive chain as (
      select id, parent_id from ${nodes} where id = ${id}
      union all
      select n.id, n.parent_id from ${nodes} n join chain c on n.id = c.parent_id
    )
    select case max(case s.role when 'edit' then 2 when 'view' then 1 end)
      when 2 then 'edit' when 1 then 'view' end as role
    from chain join ${shares} s on s.node_id = chain.id and s.user_id = ${user}`);
  return row?.role ? { node, role: row.role } : null;
};

/**
 * A node the user may use as `needed` asks. Someone without any access learns nothing: for them
 * the node does not exist. Someone who may look but not change gets "forbidden".
 */
export const requireRole = async (
  db: Queryable,
  user: UserId,
  id: string,
  needed: Role,
): Promise<Result<Accessible>> => {
  const access = await roleOf(db, user, id);
  if (!access) return fail("not_found", NOT_FOUND);
  if (!allows(access.role, needed)) {
    return fail(
      "forbidden",
      needed === "owner" ? "Das darf nur, wem es gehört." : "Du darfst das nur ansehen.",
    );
  }
  return ok(access);
};

/** The roles shares give the user directly on some nodes, for listing children that have their own. */
export const directRoles = async (db: Queryable, user: UserId, ids: string[]): Promise<Map<string, Role>> => {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ nodeId: shares.nodeId, role: shares.role })
    .from(shares)
    .where(and(eq(shares.userId, user), inArray(shares.nodeId, ids)));
  return new Map(rows.map((row) => [row.nodeId, row.role]));
};
