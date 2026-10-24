import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ocrFiles } from "./ocr-plugin";

describe("ocrFiles", () => {
  it("finds every file text recognition loads in the installed packages", () => {
    const files = ocrFiles();
    expect(Object.keys(files).sort()).toEqual([
      "deu.traineddata.gz",
      "eng.traineddata.gz",
      "tesseract-core-lstm.wasm.js",
      "tesseract-core-relaxedsimd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm.js",
      "worker.min.js",
    ]);
    for (const file of Object.values(files)) expect(statSync(file).size).toBeGreaterThan(0);
  });
});
