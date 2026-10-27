import { sql } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { nodes, versions } from "../db/schema";
import type { UserId } from "./access";

export type Usage = { files: number; versions: number; trash: number };

/**
 * What the user's own files take, by the sizes of their versions: the newest of every file outside
 * the trash, the older ones, and everything in the trash. Shared files count for their owner.
 */
export const usageOf = (db: Queryable, user: UserId): Usage => {
  // `all`, as access.ts: drizzle's bun-sqlite `get` gives a raw query's row as an array.
  const [row] = db.all<Usage>(sql`
    select
      coalesce(sum(case when n.trashed_at is null and v.number = n.version then v.size end), 0) as files,
      coalesce(sum(case when n.trashed_at is null and v.number <> n.version then v.size end), 0) as versions,
      coalesce(sum(case when n.trashed_at is not null then v.size end), 0) as trash
    from ${versions} v join ${nodes} n on n.id = v.file_id
    where n.owner_id = ${user}`);
  return row ?? { files: 0, versions: 0, trash: 0 };
};
