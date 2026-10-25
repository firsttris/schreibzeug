import { describe, expect, it } from "vitest";
import { copyName, nodeNameSchema, updateNodeSchema } from "../src";

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

describe("copyName", () => {
  it("marks the copy before the extension", () => {
    expect(copyName("Bericht.docx", 1)).toBe("Bericht (Kopie).docx");
    expect(copyName("Bericht.docx", 2)).toBe("Bericht (Kopie 2).docx");
    expect(copyName("Notizen", 1)).toBe("Notizen (Kopie)");
  });

  it("shortens the base of a long name, so the copy's name is still one", () => {
    const name = copyName(`${"a".repeat(250)}.docx`, 12);
    expect(name).toBe(`${"a".repeat(239)} (Kopie 12).docx`);
    expect(name).toHaveLength(255);
    expect(nodeNameSchema.safeParse(name).success).toBe(true);
    expect(copyName(`${"😀".repeat(125)}x.docx`, 1)).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});
