import type { LocalDeps } from "@schreibzeug/local";
import { parseMediaName } from "@schreibzeug/server/files/media";
import { sha256Of } from "./folder";

type BlobStore = LocalDeps["media"];

/**
 * The images put into a file while it is edited (apps/server src/files/media.ts), held in the
 * page. The engine loads an image by its URL, from an <img> in its frame, which no swapped `fetch`
 * reaches: so each image gets a blob URL of its own, and `urlOf` hands it out in place of
 * `/api/files/:id/media/:name` (api/context.tsx `mediaUrl`).
 */
export const createMemoryMedia = (createUrl: (blob: Blob) => string = URL.createObjectURL) => {
  const blobs = new Map<string, { bytes: Uint8Array; storedAt: Date; url: string }>();

  const store: BlobStore = {
    put: async (bytes) => {
      const sha256 = await sha256Of(bytes);
      const held = blobs.get(sha256);
      const url = held?.url ?? createUrl(new Blob([bytes as Uint8Array<ArrayBuffer>]));
      blobs.set(sha256, { bytes, storedAt: new Date(), url });
      return sha256;
    },
    get: async (sha256) => {
      const held = blobs.get(sha256);
      if (!held) throw new Error(`no such image: ${sha256}`);
      return held.bytes;
    },
    list: async () => [...blobs].map(([sha256, { storedAt }]) => ({ sha256, storedAt })),
    remove: async (sha256) => {
      blobs.delete(sha256);
    },
  };

  /** The blob URL of an image by its media name (`<sha256>.<ext>`), or "" for one never stored. */
  const urlOf = (name: string): string => {
    const parsed = parseMediaName(name);
    return (parsed && blobs.get(parsed.sha256)?.url) || "";
  };

  return { store, urlOf };
};
