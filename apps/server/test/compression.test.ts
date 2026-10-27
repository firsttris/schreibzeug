import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createCompressionCache, encodingFor, isCompressible } from "../src/compression";

describe("encodingFor", () => {
  it("prefers Brotli, then gzip, as the browser offers them", () => {
    expect(encodingFor("gzip, deflate, br, zstd")).toBe("br");
    // Over plain HTTP browsers offer no Brotli.
    expect(encodingFor("gzip, deflate")).toBe("gzip");
    expect(encodingFor("identity")).toBeNull();
    expect(encodingFor(undefined)).toBeNull();
  });

  it("leaves out what the browser refuses with q=0", () => {
    expect(encodingFor("br;q=0, gzip;q=0.8")).toBe("gzip");
    expect(encodingFor("br; q=0.5")).toBe("br");
  });
});

describe("isCompressible", () => {
  it("takes scripts, WebAssembly and the engine's fonts, not images or archives", () => {
    expect(isCompressible("text/javascript;charset=utf-8", 4096)).toBe(true);
    expect(isCompressible("application/wasm", 4096)).toBe(true);
    expect(isCompressible("application/octet-stream", 4096)).toBe(true);
    expect(isCompressible("image/svg+xml", 4096)).toBe(true);
    expect(isCompressible("image/png", 4096)).toBe(false);
    expect(isCompressible("application/gzip", 4096)).toBe(false);
    expect(isCompressible("text/javascript;charset=utf-8", 100)).toBe(false);
  });
});

const text = (content: string) => new TextEncoder().encode(content);

describe("createCompressionCache", () => {
  it("compresses each version of a file once", async () => {
    const compressed = createCompressionCache(1024 * 1024);
    let reads = 0;
    const read = async () => {
      reads += 1;
      return text("sdkjs ".repeat(1000));
    };
    const file = { path: "/engine/sdk-all.js", size: 6000, lastModified: 1 };
    const [first, second] = await Promise.all([compressed(file, "br", read), compressed(file, "br", read)]);
    expect(first).toBe(second);
    expect(new TextDecoder().decode(brotliDecompressSync(first))).toBe("sdkjs ".repeat(1000));
    await compressed(file, "br", read);
    expect(reads).toBe(1);
    await compressed({ ...file, lastModified: 2 }, "br", read);
    await compressed(file, "gzip", read);
    expect(reads).toBe(3);
  });

  it("lets the files used longest ago go past its budget", async () => {
    const compressed = createCompressionCache(1);
    let reads = 0;
    const read = async () => {
      reads += 1;
      return text("x".repeat(5000));
    };
    const a = { path: "/a", size: 5000, lastModified: 1 };
    const b = { path: "/b", size: 5000, lastModified: 1 };
    await compressed(a, "gzip", read);
    await compressed(b, "gzip", read);
    await compressed(b, "gzip", read);
    expect(reads).toBe(2);
    await compressed(a, "gzip", read);
    expect(reads).toBe(3);
  });
});
