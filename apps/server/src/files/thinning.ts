import { and, eq, inArray } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { nodes, versions } from "../db/schema";

/** How many versions a file keeps: thinned out with age (the default), or every one of them. */
export type VersionPolicy = "thin" | "all";

export type VersionStamp = { number: number; createdAt: Date; kept: boolean };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * The steps by age, as Google Docs and Nextcloud thin their histories: every save of the last day,
 * then the newest one per hour up to a month, per day up to a year, per week after that.
 */
const STEPS: readonly { upTo: number; slot: number }[] = [
  { upTo: DAY, slot: 0 },
  { upTo: 30 * DAY, slot: HOUR },
  { upTo: 365 * DAY, slot: DAY },
  { upTo: Number.POSITIVE_INFINITY, slot: WEEK },
];

/** The step a version falls into and its slot there; null: young enough to stay as it is. */
const slotOf = (createdAt: Date, now: Date): string | null => {
  const age = now.getTime() - createdAt.getTime();
  const step = STEPS.findIndex(({ upTo }) => age < upTo);
  const { slot } = STEPS[step] ?? { slot: WEEK };
  return slot === 0 ? null : `${step}:${Math.floor(createdAt.getTime() / slot)}`;
};

/**
 * The numbers of the versions to drop, newest first: in every slot all but the newest. The newest
 * version of the file and the versions someone chose to keep always stay.
 */
export const versionsToThin = (stamps: readonly VersionStamp[], now: Date): number[] => {
  const newest = Math.max(...stamps.map((stamp) => stamp.number));
  const taken = new Set<string>();
  return [...stamps]
    .sort((a, b) => b.number - a.number)
    .filter((stamp) => {
      const slot = slotOf(stamp.createdAt, now);
      if (slot === null) return false;
      // The newest and a kept version stay and stand for their slot.
      const stays = stamp.kept || stamp.number === newest || !taken.has(slot);
      taken.add(slot);
      return !stays;
    })
    .map((stamp) => stamp.number);
};

/**
 * Drops the file's versions that `versionsToThin` names. Their bytes stay in the blob store until
 * the next collection (blob-collection.ts), which removes them once nothing refers to them.
 */
export const thinVersions = (db: Queryable, fileId: string, now: Date): number[] =>
  db.transaction((tx) => {
    const file = tx.select({ version: nodes.version }).from(nodes).where(eq(nodes.id, fileId)).get();
    if (!file?.version) return [];
    const stamps = tx
      .select({ number: versions.number, createdAt: versions.createdAt, kept: versions.kept })
      .from(versions)
      .where(eq(versions.fileId, fileId))
      .all();
    const drop = versionsToThin(stamps, now).filter((number) => number !== file.version);
    if (drop.length)
      tx.delete(versions)
        .where(and(eq(versions.fileId, fileId), inArray(versions.number, drop)))
        .run();
    return drop;
  });
