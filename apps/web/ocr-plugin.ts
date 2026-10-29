import { createReadStream } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { underBase } from "./engine-plugin";

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/**
 * What text recognition loads, by the name the page asks for. Tesseract.js would fetch them from a
 * CDN; here they come from the app itself, so a scan never leaves the computer and the desktop app
 * recognises text offline. The core comes as each of the builds its worker picks from by what the
 * browser supports (tesseract.js src/worker-script/browser/getCore.js, LSTM only), the languages
 * as Tesseract's integer-quantised "best" models (tessdata_best, Apache-2.0).
 */
export const ocrFiles = (): Record<string, string> => {
  const core = packageDir("tesseract.js-core");
  const data = (lang: string) =>
    join(packageDir(`@tesseract.js-data/${lang}`), "4.0.0_best_int", `${lang}.traineddata.gz`);
  return {
    "worker.min.js": join(packageDir("tesseract.js"), "dist", "worker.min.js"),
    "tesseract-core-lstm.wasm.js": join(core, "tesseract-core-lstm.wasm.js"),
    "tesseract-core-simd-lstm.wasm.js": join(core, "tesseract-core-simd-lstm.wasm.js"),
    "tesseract-core-relaxedsimd-lstm.wasm.js": join(core, "tesseract-core-relaxedsimd-lstm.wasm.js"),
    "deu.traineddata.gz": data("deu"),
    "eng.traineddata.gz": data("eng"),
  };
};

const serve =
  (files: Record<string, string>) =>
  (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const file = files[(req.url ?? "/").split("?")[0]?.replace(/^\//, "") ?? ""];
    if (!file) {
      next();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream",
    );
    res.setHeader("Cache-Control", "public, max-age=3600");
    createReadStream(file).pipe(res);
  };

/** Serves the text recognition files at /ocr in dev and preview and copies them into the build. */
export const ocrPlugin = (base = "/ocr"): Plugin => {
  const files = ocrFiles();
  let outDir = "dist";
  return {
    name: "schreibzeug-ocr",
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer: (server) => {
      server.middlewares.use(underBase(server.config.base, base), serve(files));
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(underBase(server.config.base, base), serve(files));
    },
    closeBundle: async () => {
      const target = join(outDir, base);
      await mkdir(target, { recursive: true });
      await Promise.all(Object.entries(files).map(([name, from]) => copyFile(from, join(target, name))));
    },
  };
};
