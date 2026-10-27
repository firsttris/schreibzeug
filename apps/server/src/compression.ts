import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

/** The encodings files are sent in, besides as they are. */
export type Encoding = "br" | "gzip";

/**
 * The encoding to send, from the request's Accept-Encoding: Brotli where the browser takes it (over
 * HTTPS), else gzip (browsers send no "br" over plain HTTP), else none. "q=0" refuses one.
 */
export const encodingFor = (acceptEncoding: string | undefined): Encoding | null => {
  const accepted = new Set(
    (acceptEncoding ?? "")
      .split(",")
      .map((part) => part.trim().split(";"))
      .filter(([, ...params]) => !params.some((param) => /^\s*q=0(\.0*)?\s*$/i.test(param)))
      .map(([name]) => name?.trim().toLowerCase()),
  );
  if (accepted.has("br")) return "br";
  if (accepted.has("gzip")) return "gzip";
  return null;
};

/**
 * Worth compressing: text, JavaScript, JSON, WebAssembly, and the engine's binary files (its fonts
 * have no extension and shrink by more than half). Images, archives and fonts in their own
 * compressed formats do not shrink.
 */
export const isCompressible = (type: string, size: number): boolean =>
  size >= 1024 &&
  (/^text\//.test(type) ||
    /^application\/(javascript|json|wasm|octet-stream|xml)\b/.test(type) ||
    type.startsWith("image/svg+xml"));

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/**
 * Brotli at quality 5: 35 MB of x2t.wasm in about a second to 8 MB; quality 11 gives 7 MB but
 * takes two minutes, too long for the first request after a start. Off the event loop (zlib's
 * thread pool).
 */
const compress = (bytes: Uint8Array, encoding: Encoding): Promise<Uint8Array> =>
  encoding === "br"
    ? brotli(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 5,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        },
      })
    : gzipAsync(bytes, { level: 6 });

/** A file as the server knows it: where it is, and what tells one version from the next. */
export type FileVersion = { path: string; size: number; lastModified: number };

/**
 * Compresses each file once and keeps the result, up to `budgetBytes` in all; past that the files
 * used longest ago go first, never one still being compressed. A changed file (size or time) is
 * compressed again. Two requests for the same file at once share one compression.
 */
export const createCompressionCache = (budgetBytes: number) => {
  const entries = new Map<string, Promise<Uint8Array>>();
  // The finished ones, by when they were last used, oldest first, with their compressed size.
  const finished = new Map<string, number>();
  let used = 0;

  const forget = (key: string) => {
    entries.delete(key);
    used -= finished.get(key) ?? 0;
    finished.delete(key);
  };

  const keep = (key: string, size: number) => {
    finished.set(key, size);
    used += size;
    for (const oldest of finished.keys()) {
      if (used <= budgetBytes) break;
      // The one just kept stays, even alone past the budget: it is the one asked for.
      if (oldest !== key) forget(oldest);
    }
  };

  return (file: FileVersion, encoding: Encoding, read: () => Promise<Uint8Array>): Promise<Uint8Array> => {
    const key = `${encoding}:${file.path}:${file.size}:${file.lastModified}`;
    const known = entries.get(key);
    if (known) {
      const size = finished.get(key);
      if (size !== undefined) {
        // Used again: to the end of the line.
        finished.delete(key);
        finished.set(key, size);
      }
      return known;
    }
    const pending = read().then((bytes) => compress(bytes, encoding));
    entries.set(key, pending);
    pending.then(
      (bytes) => entries.get(key) === pending && keep(key, bytes.length),
      () => entries.get(key) === pending && forget(key),
    );
    return pending;
  };
};
