import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEnginePath } from "./engine-plugin";

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
