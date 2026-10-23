import { describe, expect, it } from "vitest";
import { nodeNameSchema, updateNodeSchema } from "../src";

describe("nodeNameSchema", () => {
  it("accepts ordinary names and trims them", () => {
    expect(nodeNameSchema.parse("  Übersicht 2026 (Entwurf).docx ")).toBe("Übersicht 2026 (Entwurf).docx");
  });

  it.each([
    "",
    "   ",
    ".",
    "..",
    "a/b",
    "a\\b",
    "a:b",
    "a*b",
    "a?b",
    'a"b',
    "a<b",
    "a|b",
    "a\u0000b",
    "x".repeat(256),
  ])("rejects %j", (name) => {
    expect(nodeNameSchema.safeParse(name).success).toBe(false);
  });
});

describe("updateNodeSchema", () => {
  it("needs a name or a new folder", () => {
    expect(updateNodeSchema.safeParse({}).success).toBe(false);
    expect(updateNodeSchema.safeParse({ parentId: null }).success).toBe(true);
    expect(updateNodeSchema.safeParse({ name: "Neu" }).success).toBe(true);
  });
});
