import type { MediaFiles } from "./converter";
import type { DocumentUrls } from "./engine-types";

/** common/editorscommon.js DocumentUrls.mediaPrefix */
const MEDIA_PREFIX = "media/";

/**
 * Hands the images of a document to the engine: as blob URLs made in its frame, under the path the
 * document refers to them by ("media/image1.png"). The engine draws an image from the URL it finds
 * there (DocumentUrls.getImageUrl); the Document Server fills the same map from the `open` answer
 * (common/apiBase.js), which a session started without one keeps, since `init` only adds.
 */
export const provideMedia = (
  urls: DocumentUrls,
  media: MediaFiles,
  toUrl: (bytes: Uint8Array) => string,
): void => {
  const entries = Object.entries(media).map(([name, bytes]) => [`${MEDIA_PREFIX}${name}`, toUrl(bytes)]);
  if (entries.length > 0) urls.addUrls(Object.fromEntries(entries));
};

/**
 * Where images added while editing go: the server keeps them, and the engine loads them from a URL
 * every participant can reach, as with the Document Server's upload (common/editorscommon.js
 * UploadImageFiles: it answers `{"media/<name>": url}`, which goes into DocumentUrls).
 */
export type ImageStore = {
  /** Stores the image and answers the name it gets in the file and the absolute URL it loads from. */
  upload: (bytes: Uint8Array) => Promise<{ name: string; url: string }>;
};

/** Adds an image of the store to the document map, under the name it gets in the file. */
export const addImage = (urls: DocumentUrls, name: string, url: string): void =>
  urls.addUrls({ [`${MEDIA_PREFIX}${name}`]: url });

/**
 * The images the document holds now, also ones added while editing, for the converter to put into
 * the Office file or the PDF.
 */
export const collectMedia = async (
  urls: DocumentUrls,
  fetchBytes: (url: string) => Promise<ArrayBuffer>,
): Promise<MediaFiles> => {
  const images = Object.entries(urls.getUrls()).filter(([path]) => path.startsWith(MEDIA_PREFIX));
  const files = await Promise.all(
    images.map(
      async ([path, url]) =>
        [path.slice(MEDIA_PREFIX.length), new Uint8Array(await fetchBytes(url))] as const,
    ),
  );
  return Object.fromEntries(files);
};
