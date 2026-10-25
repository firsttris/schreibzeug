/**
 * How far a shared session is ahead of the stored file. In fast co-editing the engine counts a
 * change as saved once the relay has it (its "modified" flag drops), but the relay keeps changes
 * only in memory. What is safe is what a stored version holds, so the editor follows the change
 * log's length and the relay's `schreibzeug:saved` index (apps/server src/collab/session.ts).
 */

export type SessionProgress = {
  /** Changes of the log this copy holds: received from others or acknowledged as its own. */
  seen: number;
  /** Changes of the log a stored version holds. */
  saved: number;
  /** Who made the newest change this copy knows of. */
  lastAuthor: "me" | "other" | null;
};

export const initialProgress: SessionProgress = { seen: 0, saved: 0, lastAuthor: null };

type RelayMessage = {
  type?: unknown;
  changes?: unknown;
  syncChangesIndex?: unknown;
  index?: unknown;
};

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

/**
 * Reads one message from the relay. The counts are the ones DocsCoServer sends and the relay
 * mirrors: `authChanges` carries the whole log, `saveChanges` (from others) and `unSaveLock` (own
 * changes placed) carry `syncChangesIndex`, the log's length after them.
 */
export const readProgress = (progress: SessionProgress, json: string): SessionProgress => {
  let message: RelayMessage;
  try {
    message = JSON.parse(json) as RelayMessage;
  } catch {
    return progress;
  }
  switch (message.type) {
    case "authChanges": {
      const seen = Array.isArray(message.changes) ? message.changes.length : progress.seen;
      return { ...progress, seen: Math.max(progress.seen, seen) };
    }
    case "saveChanges": {
      const seen = count(message.syncChangesIndex);
      return seen === null
        ? progress
        : { ...progress, seen: Math.max(progress.seen, seen), lastAuthor: "other" };
    }
    case "unSaveLock":
    case "savePartChanges": {
      const seen = count(message.syncChangesIndex);
      return seen === null
        ? progress
        : { ...progress, seen: Math.max(progress.seen, seen), lastAuthor: "me" };
    }
    case "schreibzeug:saved": {
      const saved = count(message.index);
      // The relay's index is the newest version's, which may hold less than an earlier one.
      return saved === null ? progress : { ...progress, saved };
    }
    default:
      return progress;
  }
};

/** Whether the session holds changes no stored version has. */
export const isAhead = (progress: SessionProgress): boolean => progress.seen > progress.saved;

/** Waits before saving on its own: the newest author saves first, the others only if it does not. */
export const AUTOSAVE_DELAY = { author: 3_000, fallback: 15_000 } as const;

/**
 * How long to wait, after the last change, before this copy saves on its own; null when there is
 * nothing to save. One person's save stores everyone's changes, so the author of the newest change
 * goes first and the others wait longer, in case that person has left meanwhile.
 */
export const autosaveDelay = (progress: SessionProgress, modified: boolean): number | null => {
  if (!isAhead(progress) && !modified) return null;
  return progress.lastAuthor === "other" ? AUTOSAVE_DELAY.fallback : AUTOSAVE_DELAY.author;
};
