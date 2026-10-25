/**
 * The folder keeps no older versions, but an editing session opens the version it started at
 * (apps/server src/collab/hub.ts): whoever joins later loads that version and replays the session's
 * changes on it, also after saves moved the file on. So the bytes of a session's base are kept when
 * they are served while that version is still the file on disk, for as long as the session lasts.
 */
export const createSessionBases = (
  sessionOf: (fileId: string) => { baseVersion: number; changes: number } | undefined,
) => {
  const kept = new Map<string, { version: number; bytes: Uint8Array }>();
  return {
    /**
     * The bytes of the version asked for (none: the newest), or null when this folder no longer
     * has it. `current` and `onDisk` are the file as it is now.
     */
    bytesOf: (
      fileId: string,
      asked: number | undefined,
      current: number | null,
      onDisk: Uint8Array,
    ): Uint8Array | null => {
      const session = sessionOf(fileId);
      const base = session?.baseVersion;
      if (base === undefined) kept.delete(fileId);
      if (asked === undefined || asked === current) {
        // Taken once, at the session's first load, before any save of it: a read racing a save
        // may get the saved bytes still under the old version number.
        if (base !== undefined && base === current && kept.get(fileId)?.version !== base)
          kept.set(fileId, { version: base, bytes: onDisk });
        return onDisk;
      }
      const held = kept.get(fileId);
      if (held && held.version === asked && base === asked) return held.bytes;
      // Written from outside before the session's first load: with no change made yet, the file
      // as it is now is as good a start, for everyone joining.
      if (base === asked && session?.changes === 0 && !held) {
        kept.set(fileId, { version: base, bytes: onDisk });
        return onDisk;
      }
      return null;
    },
  };
};
