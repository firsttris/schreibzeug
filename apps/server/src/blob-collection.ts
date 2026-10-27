import type { BlobStore } from "./blobs";
import type { Queryable } from "./db/database";
import { media, versions } from "./db/schema";

/**
 * How long a blob nobody refers to stays: a save stores the bytes before it writes their row
 * (files/routes.ts), and storing them again renews the time (blobs.ts), so a blob of a save under
 * way is never taken.
 */
export const BLOB_GRACE_MS = 60 * 60 * 1000;

/** The blobs to remove: older than the grace and named by no version and no image. */
export const unusedBlobs = (
  blobs: readonly { sha256: string; storedAt: Date }[],
  used: ReadonlySet<string>,
  now: Date,
): string[] =>
  blobs
    .filter(({ sha256, storedAt }) => !used.has(sha256) && now.getTime() - storedAt.getTime() > BLOB_GRACE_MS)
    .map(({ sha256 }) => sha256);

/** Removes the blobs that thinning (files/thinning.ts) left without a version; returns how many. */
export const collectBlobs = async (db: Queryable, blobs: BlobStore, now: Date): Promise<number> => {
  const listed = await blobs.list();
  // Read after the listing: a row written meanwhile is then seen, a blob stored meanwhile is young.
  const used = new Set(
    [
      ...db.selectDistinct({ sha256: versions.sha256 }).from(versions).all(),
      ...db.selectDistinct({ sha256: media.sha256 }).from(media).all(),
    ].map((row) => row.sha256),
  );
  const unused = unusedBlobs(listed, used, now);
  for (const sha256 of unused) await blobs.remove(sha256);
  return unused.length;
};
