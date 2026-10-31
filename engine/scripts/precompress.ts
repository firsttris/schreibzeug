/**
 * Writes a Brotli copy at quality 11 beside each large script and WebAssembly module of the
 * prepared engine (engine/dist), which the server sends instead of compressing at quality 5 itself
 * (apps/server/src/web.ts precompressedOf): x2t.wasm 6.8 MB instead of 8.1, word/sdk-all.js 2.4
 * instead of 2.9. Quality 11 takes minutes, too long for a server's first request, so it runs once
 * where the engine is built for the server: the Docker image's engine layer (docker/Dockerfile).
 * The desktop app and the demo send no compressed files and do without.
 *
 * Usage: bun engine/scripts/precompress.ts [engine/dist]
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";

/** Below this the gain is a few kilobytes; the fonts have their own folder and stay as they are. */
const MIN_BYTES = 1024 * 1024;

/**
 * The files a browser loads that are worth it: scripts and WebAssembly modules, not the `_ie.js`
 * fallbacks sdkjs takes only where there is no WebAssembly (common/libfont/loader.js).
 */
const isPrecompressed = (path: string, size: number): boolean =>
  size >= MIN_BYTES && /\.(js|wasm)$/.test(path) && !path.endsWith("_ie.js") && !path.startsWith("fonts/");

const compress = promisify(brotliCompress);

const filesOf = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

const precompress = async (dir: string): Promise<void> => {
  const files = filesOf(dir).filter((file) => isPrecompressed(relative(dir, file), statSync(file).size));
  const started = performance.now();
  // zlib's thread pool takes them side by side; x2t.wasm, the largest, sets the time.
  await Promise.all(
    files.map(async (file) => {
      const bytes = await Bun.file(file).bytes();
      const compressed = await compress(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_LGWIN]: 24,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        },
      });
      await Bun.write(`${file}.br`, compressed);
      console.log(`${relative(dir, file)}: ${bytes.length} → ${compressed.length} bytes`);
    }),
  );
  console.log(`${files.length} files compressed in ${((performance.now() - started) / 1000).toFixed(1)} s`);
};

if (import.meta.main) await precompress(resolve(process.argv[2] ?? join(import.meta.dir, "../dist")));
