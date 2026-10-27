import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BlobStore = {
  /** Stores the bytes and returns their SHA-256, which is also their key. Storing twice is free. */
  put: (bytes: Uint8Array) => Promise<string>;
  get: (sha256: string) => Promise<Uint8Array>;
  /** Every blob with when it was last stored, for the collection of the unused (blob-collection.ts). */
  list: () => Promise<{ sha256: string; storedAt: Date }[]>;
  remove: (sha256: string) => Promise<void>;
};

const SHA256 = /^[0-9a-f]{64}$/;

export const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * Content-addressed files under `dir/ab/abcdef…`. A blob is written to a temporary name and then
 * renamed, so a crash never leaves a half-written blob under a real key.
 */
export const createBlobStore = (dir: string): BlobStore => {
  const pathOf = (sha256: string): string => {
    if (!SHA256.test(sha256)) throw new Error(`not a blob key: ${sha256}`);
    return join(dir, sha256.slice(0, 2), sha256);
  };

  return {
    put: async (bytes) => {
      const sha256 = sha256Of(bytes);
      const target = pathOf(sha256);
      // Stored again: the new time keeps the collection off it until its row is written.
      if (await exists(target)) {
        const now = new Date();
        await utimes(target, now, now);
        return sha256;
      }
      await mkdir(join(dir, sha256.slice(0, 2)), { recursive: true });
      const temporary = join(dir, `.tmp-${randomUUID()}`);
      try {
        await writeFile(temporary, bytes);
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
      return sha256;
    },
    get: async (sha256) => new Uint8Array(await readFile(pathOf(sha256))),
    list: async () => {
      const folders = await readdir(dir).catch(() => [] as string[]);
      const names = (
        await Promise.all(folders.map((folder) => readdir(join(dir, folder)).catch(() => [] as string[])))
      )
        .flat()
        .filter((name) => SHA256.test(name));
      const listed = await Promise.all(
        names.map((sha256) =>
          stat(pathOf(sha256)).then(
            ({ mtime }) => ({ sha256, storedAt: mtime }),
            () => null, // removed meanwhile
          ),
        ),
      );
      return listed.filter((blob) => blob !== null);
    },
    remove: (sha256) => rm(pathOf(sha256), { force: true }),
  };
};
