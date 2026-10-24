/**
 * Images added to a document while it is edited. They go into the blob store under their SHA-256
 * and are named after it, so the name is the key and the same picture is stored once. Only the
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
