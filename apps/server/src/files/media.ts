import { and, eq } from "drizzle-orm";
import type { Queryable } from "../db/database";
import { media } from "../db/schema";

/**
 * Images added to a document while it is edited. They go into the blob store under their SHA-256
 * and are named after it, so the name is the key and the same picture is stored once. A row in
 * `media` ties an image to the file it was put into, and only that file's route serves it: the
 * blob store also holds every version's bytes, and a hash alone must not open them. Only the
 * formats an Office file takes as a picture are accepted, recognised by their first bytes rather
 * than by what the browser claims.
 */

export type ImageType = { extension: string; mime: string };

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, index) => bytes[index] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

const IMAGE_TYPES: ReadonlyArray<ImageType & { signature: readonly number[] }> = [
  { extension: "png", mime: "image/png", signature: [0x89, ...ascii("PNG")] },
  { extension: "jpg", mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { extension: "gif", mime: "image/gif", signature: ascii("GIF8") },
  { extension: "bmp", mime: "image/bmp", signature: ascii("BM") },
];

export const imageTypeOf = (bytes: Uint8Array): ImageType | null => {
  const found = IMAGE_TYPES.find(({ signature }) => startsWith(bytes, signature));
  return found ? { extension: found.extension, mime: found.mime } : null;
};

export const mediaNameOf = (sha256: string, type: ImageType): string => `${sha256}.${type.extension}`;

const MEDIA_NAME = /^([0-9a-f]{64})\.([a-z]+)$/;

/** The blob key and type behind a media name, or null for a name Schreibzeug did not give out. */
export const parseMediaName = (name: string): { sha256: string; type: ImageType } | null => {
  const [, sha256, extension] = MEDIA_NAME.exec(name) ?? [];
  const type = IMAGE_TYPES.find((candidate) => candidate.extension === extension);
  return sha256 && type ? { sha256, type: { extension: type.extension, mime: type.mime } } : null;
};

/** Records that an image belongs to a file; storing the same image again changes nothing. */
export const recordMedia = (db: Queryable, fileId: string, sha256: string): void => {
  db.insert(media).values({ fileId, sha256 }).onConflictDoNothing().run();
};

/** Whether the image was put into this file. */
export const hasMedia = (db: Queryable, fileId: string, sha256: string): boolean =>
  db
    .select({ sha256: media.sha256 })
    .from(media)
    .where(and(eq(media.fileId, fileId), eq(media.sha256, sha256)))
    .get() !== undefined;
