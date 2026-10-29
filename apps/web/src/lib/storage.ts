import type { Storage } from "@schreibzeug/files-api";
import { m } from "../paraglide/messages";
import { formatSize } from "./format";

export type Tone = "normal" | "warn" | "full";
type Disk = NonNullable<Storage["disk"]>;

/** How full the drive is, and how that looks: yellow from 80 %, red from 95 %, as Kontext's mailbox ring. */
export const diskLevel = ({ free, total }: Disk): { percent: number; tone: Tone } => {
  const percent = total > 0 ? Math.min(100, ((total - free) / total) * 100) : 0;
  return { percent, tone: percent >= 95 ? "full" : percent >= 80 ? "warn" : "normal" };
};

/** Below this much free room a save may fail soon, whatever the drive's size. */
export const LOW_SPACE_BYTES = 1024 ** 3;

/**
 * Whether the next saves may fail for want of room: less free than 1 GB, or than the largest file
 * the server takes. Not a share of the drive: 5 % of a large one is still plenty.
 */
export const isLow = ({ disk, uploadLimit }: Storage): boolean =>
  disk !== null && disk.free < Math.max(uploadLimit, LOW_SPACE_BYTES);

/** "38,2 GB frei von 80 GB". */
export const freeText = ({ free, total }: Disk): string =>
  m.storage_free_of({ free: formatSize(free), total: formatSize(total) });
