import { statfs } from "node:fs/promises";

export type Disk = { free: number; total: number };

/** What the system reports for a drive, in blocks, as bytes. */
export const diskOf = ({
  bsize,
  blocks,
  bavail,
}: {
  bsize: number;
  blocks: number;
  bavail: number;
}): Disk => ({
  // `bavail`, not `bfree`: the blocks reserved for root are no room for this process.
  free: bavail * bsize,
  total: blocks * bsize,
});

/**
 * How much room is left on the drive that holds `path`, asked each time (another program may fill
 * it); null when the system cannot say, e.g. the folder is gone.
 */
export const diskSpace = (path: string) => (): Promise<Disk | null> => statfs(path).then(diskOf, () => null);
