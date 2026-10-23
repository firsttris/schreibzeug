import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const nodeKind = pgEnum("node_kind", ["folder", "file"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Folders and files in one tree. A node in the trash keeps its place; `trashed_at` is set on it and,
 * with the same time, on everything below it, so "not in the trash" is one column everywhere.
 * `trash_root` marks the node the user trashed: the trash lists those, and restoring one restores
 * exactly what was trashed with it.
 */
export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => nodes.id, { onDelete: "cascade" }),
    kind: nodeKind("kind").notNull(),
    name: text("name").notNull(),
    mime: text("mime"),
    size: bigint("size", { mode: "number" }),
    version: integer("version"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    trashRoot: boolean("trash_root").notNull().default(false),
  },
  (table) => [
    // Names are unique per folder, ignoring case (as on macOS and Windows), among nodes outside the trash.
    uniqueIndex("nodes_name_per_parent")
      .on(
        sql`coalesce(${table.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`lower(${table.name})`,
      )
      .where(sql`${table.trashedAt} is null`),
    index("nodes_parent").on(table.parentId),
    index("nodes_recent")
      .on(table.updatedAt)
      .where(sql`${table.kind} = 'file' and ${table.trashedAt} is null`),
    check(
      "nodes_file_fields",
      sql`(${table.kind} = 'folder') = (${table.mime} is null and ${table.size} is null and ${table.version} is null)`,
    ),
  ],
);

/** Every saved state of a file. The bytes live in the blob store under their SHA-256. */
export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("versions_number_per_file").on(table.fileId, table.number)],
);

export type NodeRow = typeof nodes.$inferSelect;
export type VersionRow = typeof versions.$inferSelect;
