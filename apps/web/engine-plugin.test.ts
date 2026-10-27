import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engineId, resolveEnginePath, withoutEngineId } from "./engine-plugin";

const root = "/srv/engine";

describe("resolveEnginePath", () => {
  it("maps a request into the engine folder", () => {
    expect(resolveEnginePath(root, "/sdkjs/word/sdk-all-min.js")).toBe(
      join(root, "sdkjs/word/sdk-all-min.js"),
    );
  });

  it("ignores the query string", () => {
    expect(resolveEnginePath(root, "/fonts/001?v=2")).toBe(join(root, "fonts/001"));
  });

  it("refuses paths that leave the engine folder", () => {
    expect(resolveEnginePath(root, "/../../etc/passwd")).toBeNull();
    expect(resolveEnginePath(root, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });
});

describe("engineId", () => {
  it("names the engine by the stamp engine:prepare wrote, and 'dev' before it ran", () => {
    const dist = mkdtempSync(join(tmpdir(), "schreibzeug-engine-"));
    try {
      expect(engineId(dist)).toBe("dev");
      writeFileSync(join(dist, ".version"), "1d401c83dd0cd4c66bbf2884d8d6f516");
      expect(engineId(dist)).toBe("1d401c83dd0c");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe("withoutEngineId", () => {
  it("takes paths with the engine's name in front and without", () => {
    expect(withoutEngineId("/1d401c83dd0c/sdkjs/word/sdk-all.js", "1d401c83dd0c")).toBe(
      "/sdkjs/word/sdk-all.js",
    );
    expect(withoutEngineId("/frame/editor/pdf/main/index.html", "1d401c83dd0c")).toBe(
      "/frame/editor/pdf/main/index.html",
    );
  });
});
