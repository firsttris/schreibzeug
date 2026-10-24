import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export { account, session, user, verification } from "./auth-schema";

export const NODE_KINDS = ["folder", "file"] as const;
export const SHARE_ROLES = ["edit", "view"] as const;

/** Times as milliseconds since 1970, set by the server (SQLite has no time type). */
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date());
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * How a name is compared: case-insensitively, also for umlauts (SQLite's own lower() only knows
 * ASCII). Names are unique per folder by this key, and lists are sorted by it.
 */
export const nameKey = (name: string): string => name.normalize("NFC").toLowerCase();

/**
 * Folders and files in one tree. A node in the trash keeps its place; `trashed_at` is set on it and,
 * with the same time, on everything below it, so "not in the trash" is one column everywhere.
 * `trash_root` marks the node the user trashed: the trash lists those, and restoring one restores
 * exactly what was trashed with it.
 */
export const nodes = sqliteTable(
  "nodes",
  {
    id: id(),
    parentId: text("parent_id").references((): AnySQLiteColumn => nodes.id, { onDelete: "cascade" }),
    /**
     * Whose files these are; everything below a folder belongs to its owner. Empty only for files
     * from before there were accounts, which the first account takes over (auth.ts).
     */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NODE_KINDS }).notNull(),
    name: text("name").notNull(),
    /** `nameKey(name)`, kept by the repository. */
    nameKey: text("name_key").notNull(),
    mime: text("mime"),
    size: integer("size"),
    version: integer("version"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
    trashedAt: timestamp("trashed_at"),
    trashRoot: integer("trash_root", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    // Names are unique per folder among nodes outside the trash; at the top level per owner.
    // drizzle-kit 0.31 quotes the expressions of a SQLite index as column names; the line in
    // drizzle/0000_init.sql is corrected by hand. Check it when this index changes.
    uniqueIndex("nodes_name_per_parent")
      .on(sql`coalesce(${table.ownerId}, '')`, sql`coalesce(${table.parentId}, '')`, table.nameKey)
      .where(sql`${table.trashedAt} is null`),
    index("nodes_parent").on(table.parentId),
    index("nodes_owner").on(table.ownerId),
    index("nodes_recent")
      .on(table.updatedAt)
      .where(sql`${table.kind} = 'file' and ${table.trashedAt} is null`),
    check("nodes_kind", sql`${table.kind} in ('folder', 'file')`),
    check(
      "nodes_file_fields",
      sql`(${table.kind} = 'folder') = (${table.mime} is null and ${table.size} is null and ${table.version} is null)`,
    ),
  ],
);

/** Every saved state of a file. The bytes live in the blob store under their SHA-256. */
export const versions = sqliteTable(
  "versions",
  {
    id: id(),
    fileId: text("file_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("versions_number_per_file").on(table.fileId, table.number)],
);

/**
 * Who else may open a node, and how: a share on a folder holds for everything below it. The node
 * stays its owner's; files created in a shared folder belong to the folder's owner too.
 */
export const shares = sqliteTable(
  "shares",
  {
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: SHARE_ROLES }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.nodeId, table.userId] }),
    index("shares_user").on(table.userId),
    check("shares_role", sql`${table.role} in ('edit', 'view')`),
  ],
);

export type NodeRow = typeof nodes.$inferSelect;
export type ShareRow = typeof shares.$inferSelect;
export type VersionRow = typeof versions.$inferSelect;
