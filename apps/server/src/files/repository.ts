import { copyName } from "@stapel/files-api";
import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nameKey, nodes, type VersionRow, versions } from "../db/schema";
import { fail, ok, type Result } from "../result";
import { type Accessible, directRoles, NOT_FOUND, requireRole, strongest, type UserId } from "./access";

const NAME_TAKEN = "In diesem Ordner gibt es schon etwas mit diesem Namen.";
const NOT_A_FILE = "Das ist ein Ordner, keine Datei.";

/** SQLite reports a broken unique index as SQLITE_CONSTRAINT_UNIQUE; drizzle may wrap the error. */
const isUniqueViolation = (error: unknown): boolean => {
  const code = (value: unknown) => (value as { code?: unknown } | null)?.code;
  const unique = "SQLITE_CONSTRAINT_UNIQUE";
  return code(error) === unique || code((error as { cause?: unknown } | null)?.cause) === unique;
};

/**
 * Runs a write, turning a taken name into an answer. Everything here is synchronous: bun:sqlite
 * runs one statement after the other, so a function without `await` is not interleaved with
 * other requests, and a transaction must not await (database.ts).
 */
const nameTakenOnConflict = <T>(write: () => Result<T>): Result<T> => {
  try {
    return write();
  } catch (error) {
    if (isUniqueViolation(error)) return fail("name_taken", NAME_TAKEN);
    throw error;
  }
};

const active = isNull(nodes.trashedAt);
const ownedBy = (user: UserId) => eq(nodes.ownerId, user);
const asOwner = (node: NodeRow): Accessible => ({ node, role: "owner" });

export const requireFile = (
  db: Queryable,
  user: UserId,
  id: string,
  needed: "view" | "edit",
): Result<Accessible> => {
  const access = requireRole(db, user, id, needed);
  if (!access.ok) return access;
  return access.value.node.kind === "file" ? access : fail("invalid", NOT_A_FILE);
};

/**
 * The folder something goes into: the user's own top level (null), or a folder outside the trash
 * the user may change.
 */
export const findTargetFolder = (
  db: Queryable,
  user: UserId,
  parentId: string | null,
): Result<Accessible | null> => {
  if (parentId === null) return ok(null);
  const parent = requireRole(db, user, parentId, "edit");
  if (!parent.ok) {
    return parent.error.kind === "not_found" ? fail("not_found", "Der Zielordner existiert nicht.") : parent;
  }
  if (parent.value.node.kind !== "folder") return fail("not_a_folder", "Das Ziel ist kein Ordner.");
  return parent;
};

/** One node outside the trash the user may at least look at. */
export const findNode = (db: Queryable, user: UserId, id: string) => requireRole(db, user, id, "view");

/**
 * What a folder holds, folders first, then by name, ignoring case. Without a folder: the user's
 * own top level. Everything in a folder inherits the folder's role; a child shared with the user
 * on its own may give more.
 */
export const listChildren = (db: Queryable, user: UserId, folder: Accessible | null): Accessible[] => {
  const rows = db
    .select()
    .from(nodes)
    .where(
      and(
        folder === null ? and(isNull(nodes.parentId), ownedBy(user)) : eq(nodes.parentId, folder.node.id),
        active,
      ),
    )
    .orderBy(desc(sql`${nodes.kind} = 'folder'`), asc(nodes.nameKey), asc(nodes.name))
    .all();
  if (folder === null) return rows.map(asOwner);
  const own = directRoles(
    db,
    user,
    rows.map((row) => row.id),
  );
  return rows.map((node) => ({ node, role: strongest(folder.role, own.get(node.id) ?? "view") }));
};

/** `id` and the folders above it, from the top down. */
const chainTo = (db: Queryable, id: string): NodeRow[] => {
  const chain = db.all<{ id: string; depth: number }>(sql`
    with recursive chain as (
      select id, parent_id, 0 as depth from ${nodes} where id = ${id}
      union all
      select n.id, n.parent_id, c.depth + 1 from ${nodes} n join chain c on n.id = c.parent_id
    )
    select id, depth from chain`);
  if (chain.length === 0) return [];
  const depthOf = new Map(chain.map((row) => [row.id, row.depth]));
  const rows = db
    .select()
    .from(nodes)
    .where(
      inArray(
        nodes.id,
        chain.map((row) => row.id),
      ),
    )
    .all();
  return rows.sort((a, b) => (depthOf.get(b.id) ?? 0) - (depthOf.get(a.id) ?? 0));
};

/**
 * The folders from the top down to and including `id`. Someone it is shared with sees the path
 * from the folder that was shared with them, not the owner's folders above it.
 */
export const pathTo = (db: Queryable, user: UserId, folder: Accessible): NodeRow[] => {
  const chain = chainTo(db, folder.node.id);
  if (folder.role === "owner") return chain;
  const shared = directRoles(
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
  nameTakenOnConflict((): Result<Accessible> => {
    const parent = findTargetFolder(db, user, input.parentId);
    if (!parent.ok) return parent;
    const folder = db
      .insert(nodes)
      .values({
        kind: "folder",
        ownerId: ownerFor(parent.value, user),
        parentId: input.parentId,
        name: input.name,
        nameKey: nameKey(input.name),
      })
      .returning()
      .get();
    return ok({ node: folder, role: parent.value?.role ?? "owner" });
  });

export type StoredContent = { size: number; sha256: string };

export const createFile = (
  db: Queryable,
  user: UserId,
  input: { parentId: string | null; name: string; mime: string } & StoredContent,
) =>
  nameTakenOnConflict(() =>
    db.transaction((tx): Result<Accessible> => {
      const parent = findTargetFolder(tx, user, input.parentId);
      if (!parent.ok) return parent;
      const file = tx
        .insert(nodes)
        .values({
          kind: "file",
          ownerId: ownerFor(parent.value, user),
          parentId: input.parentId,
          name: input.name,
          nameKey: nameKey(input.name),
          mime: input.mime,
          size: input.size,
          version: 1,
        })
        .returning()
        .get();
      tx.insert(versions)
        .values({ fileId: file.id, number: 1, size: input.size, sha256: input.sha256 })
        .run();
      return ok({ node: file, role: parent.value?.role ?? "owner" });
    }),
  );

/**
 * A new version on top of the newest. SQLite writes one transaction at a time, so concurrent saves
 * of one file get consecutive numbers.
 */
export const addVersion = (
  db: Queryable,
  user: UserId,
  id: string,
  content: StoredContent,
): Result<Accessible> => {
  const access = requireFile(db, user, id, "edit");
  if (!access.ok) return access;
  return db.transaction((tx) => {
    const file = tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.id, id), active))
      .get();
    if (!file) return fail("not_found", NOT_FOUND);
    const latest = tx
      .select({ number: max(versions.number) })
      .from(versions)
      .where(eq(versions.fileId, id))
      .get();
    const number = (latest?.number ?? 0) + 1;
    tx.insert(versions)
      .values({ fileId: id, number, ...content })
      .run();
    const updated = tx
      .update(nodes)
      .set({ size: content.size, version: number, updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning()
      .get();
    return ok({ node: updated, role: access.value.role });
  });
};

export const listVersions = (db: Queryable, user: UserId, id: string): Result<VersionRow[]> => {
  const file = requireFile(db, user, id, "view");
  if (!file.ok) return file;
  return ok(db.select().from(versions).where(eq(versions.fileId, id)).orderBy(desc(versions.number)).all());
};

/** The file and the version to read: the given number, or the newest. */
export const findVersion = (
  db: Queryable,
  user: UserId,
  id: string,
  number?: number,
): Result<{ file: NodeRow; version: VersionRow }> => {
  const file = requireFile(db, user, id, "view");
  if (!file.ok) return file;
  const wanted = number ?? file.value.node.version ?? 0;
  const version = db
    .select()
    .from(versions)
    .where(and(eq(versions.fileId, id), eq(versions.number, wanted)))
    .get();
  return version ? ok({ file: file.value.node, version }) : fail("not_found", "Diese Version gibt es nicht.");
};

/**
 * Makes an older version the newest again, as a new version with the same bytes: the versions in
 * between stay, so restoring can itself be undone.
 */
export const restoreVersion = (
  db: Queryable,
  user: UserId,
  id: string,
  number: number,
): Result<Accessible> => {
  const found = findVersion(db, user, id, number);
  if (!found.ok) return found;
  const { size, sha256 } = found.value.version;
  return addVersion(db, user, id, { size, sha256 });
};

/** "Angebot.docx" → "Angebot (Kopie).docx", then "Angebot (Kopie 2).docx" and so on. */
const MAX_COPY_ATTEMPTS = 50;

/**
 * A new file with the newest version's bytes (the blob is shared, not stored again). It goes next to
 * the original when the user may add there, otherwise into their own files; the copy is theirs
 * or, in a shared folder, the folder owner's like everything created there.
 */
export const copyFile = (db: Queryable, user: UserId, id: string): Result<Accessible> => {
  const found = findVersion(db, user, id);
  if (!found.ok) return found;
  const { file, version } = found.value;
  const nextToOriginal =
    file.parentId === null ? file.ownerId === user : findTargetFolder(db, user, file.parentId).ok;
  const parentId = nextToOriginal ? file.parentId : null;
  for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt += 1) {
    const copy = createFile(db, user, {
      parentId,
      name: copyName(file.name, attempt),
      mime: file.mime ?? "application/octet-stream",
      size: version.size,
      sha256: version.sha256,
    });
    if (copy.ok || copy.error.kind !== "name_taken") return copy;
  }
  return fail("name_taken", NAME_TAKEN);
};

/** True when `folderId` is `id` or lies below it: moving `id` there would make a loop. */
const isInside = (db: Queryable, folderId: string, id: string): boolean =>
  chainTo(db, folderId).some((node) => node.id === id);

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
  nameTakenOnConflict((): Result<Accessible> => {
    const moving = update.parentId !== undefined;
    const access = requireRole(db, user, id, moving ? "owner" : "edit");
    if (!access.ok) return access;
    const { node, role } = access.value;
    const parentId = update.parentId === undefined ? node.parentId : update.parentId;
    if (parentId !== node.parentId) {
      const target = findTargetFolder(db, user, parentId);
      if (!target.ok) return target;
      if (target.value && target.value.node.ownerId !== node.ownerId) {
        return fail("forbidden", "In fremde Ordner lässt sich nichts verschieben.");
      }
      if (parentId !== null && isInside(db, parentId, id)) {
        return fail("conflict", "Ein Ordner kann nicht in sich selbst verschoben werden.");
      }
    }
    const name = update.name ?? node.name;
    const updated = db
      .update(nodes)
      .set({ name, nameKey: nameKey(name), parentId, updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning()
      .get();
    return updated ? ok({ node: updated, role }) : fail("not_found", NOT_FOUND);
  });

/**
 * Moves a node and everything below it into the trash, with one timestamp; only its owner may. What
 * was already in the trash below it keeps its own timestamp, so it stays there when this node
 * comes back.
 */
export const trashNode = (db: Queryable, user: UserId, id: string): Result<Accessible> => {
  const access = requireRole(db, user, id, "owner");
  if (!access.ok) return access;
  db.run(sql`
    with recursive tree as (
      select id from ${nodes} where id = ${id}
      union all
      select n.id from ${nodes} n join tree t on n.parent_id = t.id where n.trashed_at is null
    )
    update ${nodes} set trashed_at = ${Date.now()}, trash_root = (id = ${id}) where id in (select id from tree)`);
  const trashed = db.select().from(nodes).where(eq(nodes.id, id)).get();
  return trashed ? ok(asOwner(trashed)) : fail("not_found", NOT_FOUND);
};

/**
 * Gives the files from before there were accounts to `owner`; the first account calls it
 * (auth.ts), so an existing installation keeps its files.
 */
export const adoptOwnerless = (db: Queryable, owner: UserId): void => {
  db.update(nodes).set({ ownerId: owner }).where(isNull(nodes.ownerId)).run();
};

/** Brings back what `trashNode` moved, into its old folder, which must not be in the trash itself. */
export const restoreNode = (db: Queryable, user: UserId, id: string) =>
  nameTakenOnConflict((): Result<Accessible> => {
    const node = db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), ownedBy(user), eq(nodes.trashRoot, true)))
      .get();
    if (!node) return fail("not_found", "Das liegt nicht im Papierkorb.");
    if (node.parentId !== null) {
      const parent = db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.id, node.parentId), active))
        .get();
      if (!parent) return fail("conflict", "Der Ordner, in dem es lag, ist selbst im Papierkorb.");
    }
    db.run(sql`
      with recursive tree as (
        select id from ${nodes} where id = ${id}
        union all
        select n.id from ${nodes} n join tree t on n.parent_id = t.id
        where n.trashed_at = (select trashed_at from ${nodes} where id = ${id}) and not n.trash_root
      )
      update ${nodes} set trashed_at = null, trash_root = 0 where id in (select id from tree)`);
    const restored = db.select().from(nodes).where(eq(nodes.id, id)).get();
    return restored ? ok(asOwner(restored)) : fail("not_found", NOT_FOUND);
  });

export const listTrash = (db: Queryable, user: UserId): Accessible[] =>
  db
    .select()
    .from(nodes)
    .where(and(eq(nodes.trashRoot, true), ownedBy(user)))
    .orderBy(desc(nodes.trashedAt))
    .all()
    .map(asOwner);

export const listRecent = (db: Queryable, user: UserId, limit = 50): Accessible[] =>
  db
    .select()
    .from(nodes)
    .where(and(eq(nodes.kind, "file"), ownedBy(user), active))
    .orderBy(desc(nodes.updatedAt))
    .limit(limit)
    .all()
    .map(asOwner);
