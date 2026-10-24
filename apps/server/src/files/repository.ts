import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nodes, type VersionRow, versions } from "../db/schema";
import { fail, ok, type Result } from "../result";
import { type Accessible, directRoles, NOT_FOUND, requireRole, strongest, type UserId } from "./access";

const NAME_TAKEN = "In diesem Ordner gibt es schon etwas mit diesem Namen.";
const NOT_A_FILE = "Das ist ein Ordner, keine Datei.";

/** Postgres reports a broken unique index as 23505; drizzle may wrap the driver's error. */
const isUniqueViolation = (error: unknown): boolean => {
  const code = (value: unknown) => (value as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
};

const nameTakenOnConflict = async <T>(write: () => Promise<Result<T>>): Promise<Result<T>> => {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) return fail("name_taken", NAME_TAKEN);
    throw error;
  }
};

const active = isNull(nodes.trashedAt);
const ownedBy = (user: UserId) => eq(nodes.ownerId, user);
const asOwner = (node: NodeRow): Accessible => ({ node, role: "owner" });

const requireFile = async (
  db: Queryable,
  user: UserId,
  id: string,
  needed: "view" | "edit",
): Promise<Result<Accessible>> => {
  const access = await requireRole(db, user, id, needed);
  if (!access.ok) return access;
  return access.value.node.kind === "file" ? access : fail("invalid", NOT_A_FILE);
};

/**
 * The folder something goes into: the user's own top level (null), or a folder outside the trash
 * the user may change.
 */
export const findTargetFolder = async (
  db: Queryable,
  user: UserId,
  parentId: string | null,
): Promise<Result<Accessible | null>> => {
  if (parentId === null) return ok(null);
  const parent = await requireRole(db, user, parentId, "edit");
  if (!parent.ok) {
    return parent.error.kind === "not_found" ? fail("not_found", "Der Zielordner existiert nicht.") : parent;
  }
  if (parent.value.node.kind !== "folder") return fail("not_a_folder", "Das Ziel ist kein Ordner.");
  return parent;
};

/** One node outside the trash the user may at least look at. */
export const findNode = (db: Queryable, user: UserId, id: string) => requireRole(db, user, id, "view");

/**
 * What a folder holds, folders first, then by name as a person reads it ("Datei 2" before
 * "Datei 10"). Without a folder: the user's own top level. Everything in a folder inherits the
 * folder's role; a child shared with the user on its own may give more.
 */
export const listChildren = async (
  db: Queryable,
  user: UserId,
  folder: Accessible | null,
): Promise<Accessible[]> => {
  const rows = await db
    .select()
    .from(nodes)
    .where(
      and(
        folder === null ? and(isNull(nodes.parentId), ownedBy(user)) : eq(nodes.parentId, folder.node.id),
        active,
      ),
    )
    .orderBy(desc(sql`${nodes.kind} = 'folder'`), asc(sql`lower(${nodes.name})`), asc(nodes.name));
  if (folder === null) return rows.map(asOwner);
  const own = await directRoles(
    db,
    user,
    rows.map((row) => row.id),
  );
  return rows.map((node) => ({ node, role: strongest(folder.role, own.get(node.id) ?? "view") }));
};

const chainTo = async (db: Queryable, id: string): Promise<NodeRow[]> => {
  const chain = await db.execute<{ id: string; depth: number }>(sql`
    with recursive chain as (
      select id, parent_id, 0 as depth from ${nodes} where id = ${id}
      union all
      select n.id, n.parent_id, c.depth + 1 from ${nodes} n join chain c on n.id = c.parent_id
    )
    select id, depth from chain`);
  const ids = chain.map((row) => row.id);
  if (ids.length === 0) return [];
  const depthOf = new Map(chain.map((row) => [row.id, Number(row.depth)]));
  const rows = await db.select().from(nodes).where(inArray(nodes.id, ids));
  return rows.sort((a, b) => (depthOf.get(b.id) ?? 0) - (depthOf.get(a.id) ?? 0));
};

/**
 * The folders from the top down to and including `id`. Someone it is shared with sees the path
 * from the folder that was shared with them, not the owner's folders above it.
 */
export const pathTo = async (db: Queryable, user: UserId, folder: Accessible): Promise<NodeRow[]> => {
  const chain = await chainTo(db, folder.node.id);
  if (folder.role === "owner") return chain;
  const shared = await directRoles(
    db,
    user,
    chain.map((node) => node.id),
  );
  const top = chain.findIndex((node) => shared.has(node.id));
  return top < 0 ? [folder.node] : chain.slice(top);
};

/** New nodes belong to the owner of the folder they are created in. */
const ownerFor = (parent: Accessible | null, user: UserId): UserId => parent?.node.ownerId ?? user;

export const createFolder = (db: Queryable, user: UserId, input: { parentId: string | null; name: string }) =>
  nameTakenOnConflict(async (): Promise<Result<Accessible>> => {
    const parent = await findTargetFolder(db, user, input.parentId);
    if (!parent.ok) return parent;
    const [folder] = await db
      .insert(nodes)
      .values({
        kind: "folder",
        ownerId: ownerFor(parent.value, user),
        parentId: input.parentId,
        name: input.name,
      })
      .returning();
    return folder
      ? ok({ node: folder, role: parent.value?.role ?? "owner" })
      : fail("conflict", "Der Ordner konnte nicht angelegt werden.");
  });

export type StoredContent = { size: number; sha256: string };

export const createFile = (
  db: Queryable,
  user: UserId,
  input: { parentId: string | null; name: string; mime: string } & StoredContent,
) =>
  nameTakenOnConflict(() =>
    db.transaction(async (tx): Promise<Result<Accessible>> => {
      const parent = await findTargetFolder(tx, user, input.parentId);
      if (!parent.ok) return parent;
      const [file] = await tx
        .insert(nodes)
        .values({
          kind: "file",
          ownerId: ownerFor(parent.value, user),
          parentId: input.parentId,
          name: input.name,
          mime: input.mime,
          size: input.size,
          version: 1,
        })
        .returning();
      if (!file) return fail("conflict", "Die Datei konnte nicht angelegt werden.");
      await tx
        .insert(versions)
        .values({ fileId: file.id, number: 1, size: input.size, sha256: input.sha256 });
      return ok({ node: file, role: parent.value?.role ?? "owner" });
    }),
  );

/** A new version on top of the newest; the row lock orders concurrent saves of one file. */
export const addVersion = async (
  db: Queryable,
  user: UserId,
  id: string,
  content: StoredContent,
): Promise<Result<Accessible>> => {
  const access = await requireFile(db, user, id, "edit");
  if (!access.ok) return access;
  return db.transaction(async (tx) => {
    const [file] = await tx
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), active))
      .for("update");
    if (!file) return fail("not_found", NOT_FOUND);
    const [latest] = await tx
      .select({ number: max(versions.number) })
      .from(versions)
      .where(eq(versions.fileId, id));
    const number = (latest?.number ?? 0) + 1;
    await tx.insert(versions).values({ fileId: id, number, ...content });
    const [updated] = await tx
      .update(nodes)
      .set({ size: content.size, version: number, updatedAt: sql`now()` })
      .where(eq(nodes.id, id))
      .returning();
    return updated ? ok({ node: updated, role: access.value.role }) : fail("not_found", NOT_FOUND);
  });
};

export const listVersions = async (
  db: Queryable,
  user: UserId,
  id: string,
): Promise<Result<VersionRow[]>> => {
  const file = await requireFile(db, user, id, "view");
  if (!file.ok) return file;
  return ok(await db.select().from(versions).where(eq(versions.fileId, id)).orderBy(desc(versions.number)));
};

/** The file and the version to read: the given number, or the newest. */
export const findVersion = async (
  db: Queryable,
  user: UserId,
  id: string,
  number?: number,
): Promise<Result<{ file: NodeRow; version: VersionRow }>> => {
  const file = await requireFile(db, user, id, "view");
  if (!file.ok) return file;
  const wanted = number ?? file.value.node.version ?? 0;
  const [version] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.fileId, id), eq(versions.number, wanted)));
  return version ? ok({ file: file.value.node, version }) : fail("not_found", "Diese Version gibt es nicht.");
};

/**
 * Makes an older version the newest again, as a new version with the same bytes: the versions in
 * between stay, so restoring can itself be undone.
 */
export const restoreVersion = async (
  db: Queryable,
  user: UserId,
  id: string,
  number: number,
): Promise<Result<Accessible>> => {
  const found = await findVersion(db, user, id, number);
  if (!found.ok) return found;
  const { size, sha256 } = found.value.version;
  return addVersion(db, user, id, { size, sha256 });
};

/** True when `folderId` is `id` or lies below it: moving `id` there would make a loop. */
const isInside = async (db: Queryable, folderId: string, id: string): Promise<boolean> =>
  (await chainTo(db, folderId)).some((node) => node.id === id);

/**
 * Renames (needs "edit") and moves (only the owner, and only within their own files: a node never
 * changes hands by moving).
 */
export const updateNode = (
  db: Queryable,
  user: UserId,
  id: string,
  update: { name?: string; parentId?: string | null },
) =>
  nameTakenOnConflict(async (): Promise<Result<Accessible>> => {
    const moving = update.parentId !== undefined;
    const access = await requireRole(db, user, id, moving ? "owner" : "edit");
    if (!access.ok) return access;
    const { node, role } = access.value;
    const parentId = update.parentId === undefined ? node.parentId : update.parentId;
    if (parentId !== node.parentId) {
      const target = await findTargetFolder(db, user, parentId);
      if (!target.ok) return target;
      if (target.value && target.value.node.ownerId !== node.ownerId) {
        return fail("forbidden", "In fremde Ordner lässt sich nichts verschieben.");
      }
      if (parentId !== null && (await isInside(db, parentId, id))) {
        return fail("conflict", "Ein Ordner kann nicht in sich selbst verschoben werden.");
      }
    }
    const [updated] = await db
      .update(nodes)
      .set({ name: update.name ?? node.name, parentId, updatedAt: sql`now()` })
      .where(eq(nodes.id, id))
      .returning();
    return updated ? ok({ node: updated, role }) : fail("not_found", NOT_FOUND);
  });

/**
 * Moves a node and everything below it into the trash, with one timestamp; only its owner may. What
 * was already in the trash below it keeps its own timestamp, so it stays there when this node
 * comes back.
 */
export const trashNode = async (db: Queryable, user: UserId, id: string): Promise<Result<Accessible>> => {
  const access = await requireRole(db, user, id, "owner");
  if (!access.ok) return access;
  await db.execute(sql`
    with recursive tree as (
      select id from ${nodes} where id = ${id}
      union all
      select n.id from ${nodes} n join tree t on n.parent_id = t.id where n.trashed_at is null
    )
    update ${nodes} set trashed_at = now(), trash_root = (id = ${id}) where id in (select id from tree)`);
  const [trashed] = await db.select().from(nodes).where(eq(nodes.id, id));
  return trashed ? ok(asOwner(trashed)) : fail("not_found", NOT_FOUND);
};

/**
 * Gives the files from before there were accounts to `owner`; the first account calls it
 * (auth.ts), so an existing installation keeps its files.
 */
export const adoptOwnerless = async (db: Queryable, owner: UserId): Promise<void> => {
  await db.update(nodes).set({ ownerId: owner }).where(isNull(nodes.ownerId));
};

/** Brings back what `trashNode` moved, into its old folder, which must not be in the trash itself. */
export const restoreNode = (db: Queryable, user: UserId, id: string) =>
  nameTakenOnConflict(async (): Promise<Result<Accessible>> => {
    const [node] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), ownedBy(user), eq(nodes.trashRoot, true)));
    if (!node) return fail("not_found", "Das liegt nicht im Papierkorb.");
    if (node.parentId !== null) {
      const [parent] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.id, node.parentId), active));
      if (!parent) return fail("conflict", "Der Ordner, in dem es lag, ist selbst im Papierkorb.");
    }
    await db.execute(sql`
      with recursive tree as (
        select id from ${nodes} where id = ${id}
        union all
        select n.id from ${nodes} n join tree t on n.parent_id = t.id
        where n.trashed_at = (select trashed_at from ${nodes} where id = ${id}) and not n.trash_root
      )
      update ${nodes} set trashed_at = null, trash_root = false where id in (select id from tree)`);
    const [restored] = await db.select().from(nodes).where(eq(nodes.id, id));
    return restored ? ok(asOwner(restored)) : fail("not_found", NOT_FOUND);
  });

export const listTrash = async (db: Queryable, user: UserId): Promise<Accessible[]> =>
  (
    await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.trashRoot, true), ownedBy(user)))
      .orderBy(desc(nodes.trashedAt))
  ).map(asOwner);

export const listRecent = async (db: Queryable, user: UserId, limit = 50): Promise<Accessible[]> =>
  (
    await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.kind, "file"), ownedBy(user), active))
      .orderBy(desc(nodes.updatedAt))
      .limit(limit)
  ).map(asOwner);
