import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { type NodeRow, nodes, type VersionRow, versions } from "../db/schema";
import { fail, ok, type Result } from "../result";

const NOT_FOUND = "Die Datei oder der Ordner existiert nicht.";
const NAME_TAKEN = "In diesem Ordner gibt es schon etwas mit diesem Namen.";

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

export const findActive = async (db: Queryable, id: string): Promise<NodeRow | undefined> =>
  (
    await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), active))
  )[0];

const findActiveFile = async (db: Queryable, id: string): Promise<Result<NodeRow>> => {
  const node = await findActive(db, id);
  if (!node) return fail("not_found", NOT_FOUND);
  if (node.kind !== "file") return fail("invalid", "Das ist ein Ordner, keine Datei.");
  return ok(node);
};

/** The folder something goes into: the root (null) or an existing folder outside the trash. */
export const findTargetFolder = async (
  db: Queryable,
  parentId: string | null,
): Promise<Result<NodeRow | null>> => {
  if (parentId === null) return ok(null);
  const parent = await findActive(db, parentId);
  if (!parent) return fail("not_found", "Der Zielordner existiert nicht.");
  if (parent.kind !== "folder") return fail("not_a_folder", "Das Ziel ist kein Ordner.");
  return ok(parent);
};

/** Folders first, then by name as a person reads it ("Datei 2" before "Datei 10"). */
export const listChildren = (db: Queryable, parentId: string | null): Promise<NodeRow[]> =>
  db
    .select()
    .from(nodes)
    .where(and(parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId), active))
    .orderBy(desc(sql`${nodes.kind} = 'folder'`), asc(sql`lower(${nodes.name})`), asc(nodes.name));

/** The folders from the root down to and including `id`. */
export const pathTo = async (db: Queryable, id: string): Promise<NodeRow[]> => {
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

export const createFolder = (db: Queryable, input: { parentId: string | null; name: string }) =>
  nameTakenOnConflict(async () => {
    const parent = await findTargetFolder(db, input.parentId);
    if (!parent.ok) return parent;
    const [folder] = await db
      .insert(nodes)
      .values({ kind: "folder", parentId: input.parentId, name: input.name })
      .returning();
    return folder ? ok(folder) : fail("conflict", "Der Ordner konnte nicht angelegt werden.");
  });

export type StoredContent = { size: number; sha256: string };

export const createFile = (
  db: Queryable,
  input: { parentId: string | null; name: string; mime: string } & StoredContent,
) =>
  nameTakenOnConflict(() =>
    db.transaction(async (tx) => {
      const parent = await findTargetFolder(tx, input.parentId);
      if (!parent.ok) return parent;
      const [file] = await tx
        .insert(nodes)
        .values({
          kind: "file",
          parentId: input.parentId,
          name: input.name,
          mime: input.mime,
          size: input.size,
          version: 1,
        })
        .returning();
      if (!file) return fail<NodeRow>("conflict", "Die Datei konnte nicht angelegt werden.");
      await tx
        .insert(versions)
        .values({ fileId: file.id, number: 1, size: input.size, sha256: input.sha256 });
      return ok(file);
    }),
  );

/** A new version on top of the newest; the row lock orders concurrent saves of one file. */
export const addVersion = (db: Queryable, id: string, content: StoredContent): Promise<Result<NodeRow>> =>
  db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), active))
      .for("update");
    const file = locked[0];
    if (!file) return fail("not_found", NOT_FOUND);
    if (file.kind !== "file") return fail("invalid", "Das ist ein Ordner, keine Datei.");
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
    return updated ? ok(updated) : fail("not_found", NOT_FOUND);
  });

export const listVersions = async (db: Queryable, id: string): Promise<Result<VersionRow[]>> => {
  const file = await findActiveFile(db, id);
  if (!file.ok) return file;
  return ok(await db.select().from(versions).where(eq(versions.fileId, id)).orderBy(desc(versions.number)));
};

/** The file and the version to read: the given number, or the newest. */
export const findVersion = async (
  db: Queryable,
  id: string,
  number?: number,
): Promise<Result<{ file: NodeRow; version: VersionRow }>> => {
  const file = await findActiveFile(db, id);
  if (!file.ok) return file;
  const wanted = number ?? file.value.version ?? 0;
  const [version] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.fileId, id), eq(versions.number, wanted)));
  return version ? ok({ file: file.value, version }) : fail("not_found", "Diese Version gibt es nicht.");
};

/** True when `folderId` is `id` or lies below it: moving `id` there would make a loop. */
const isInside = async (db: Queryable, folderId: string, id: string): Promise<boolean> =>
  (await pathTo(db, folderId)).some((node) => node.id === id);

export const updateNode = (db: Queryable, id: string, update: { name?: string; parentId?: string | null }) =>
  nameTakenOnConflict(async () => {
    const node = await findActive(db, id);
    if (!node) return fail<NodeRow>("not_found", NOT_FOUND);
    const parentId = update.parentId === undefined ? node.parentId : update.parentId;
    if (parentId !== node.parentId) {
      const target = await findTargetFolder(db, parentId);
      if (!target.ok) return target as Result<NodeRow>;
      if (parentId !== null && (await isInside(db, parentId, id))) {
        return fail<NodeRow>("conflict", "Ein Ordner kann nicht in sich selbst verschoben werden.");
      }
    }
    const [updated] = await db
      .update(nodes)
      .set({ name: update.name ?? node.name, parentId, updatedAt: sql`now()` })
      .where(eq(nodes.id, id))
      .returning();
    return updated ? ok(updated) : fail<NodeRow>("not_found", NOT_FOUND);
  });

/**
 * Moves a node and everything below it into the trash, with one timestamp. What was already in the
 * trash below it keeps its own timestamp, so it stays there when this node comes back.
 */
export const trashNode = async (db: Queryable, id: string): Promise<Result<NodeRow>> => {
  if (!(await findActive(db, id))) return fail("not_found", NOT_FOUND);
  await db.execute(sql`
    with recursive tree as (
      select id from ${nodes} where id = ${id}
      union all
      select n.id from ${nodes} n join tree t on n.parent_id = t.id where n.trashed_at is null
    )
    update ${nodes} set trashed_at = now(), trash_root = (id = ${id}) where id in (select id from tree)`);
  const [trashed] = await db.select().from(nodes).where(eq(nodes.id, id));
  return trashed ? ok(trashed) : fail("not_found", NOT_FOUND);
};

/** Brings back what `trashNode` moved, into its old folder, which must not be in the trash itself. */
export const restoreNode = (db: Queryable, id: string) =>
  nameTakenOnConflict(async () => {
    const [node] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), eq(nodes.trashRoot, true)));
    if (!node) return fail<NodeRow>("not_found", "Das liegt nicht im Papierkorb.");
    if (node.parentId !== null && !(await findActive(db, node.parentId))) {
      return fail<NodeRow>("conflict", "Der Ordner, in dem es lag, ist selbst im Papierkorb.");
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
    return restored ? ok(restored) : fail<NodeRow>("not_found", NOT_FOUND);
  });

export const listTrash = (db: Queryable): Promise<NodeRow[]> =>
  db.select().from(nodes).where(eq(nodes.trashRoot, true)).orderBy(desc(nodes.trashedAt));

export const listRecent = (db: Queryable, limit = 50): Promise<NodeRow[]> =>
  db
    .select()
    .from(nodes)
    .where(and(eq(nodes.kind, "file"), active))
    .orderBy(desc(nodes.updatedAt))
    .limit(limit);
