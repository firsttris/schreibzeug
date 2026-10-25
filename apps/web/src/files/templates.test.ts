import { type FileNode, nodeNameSchema } from "@schreibzeug/files-api";
import { TEMPLATES } from "@schreibzeug/ooxml";
import { describe, expect, it } from "vitest";
import { choiceName, fileNameFor, formatOf, ownTemplates, templateFolderOf } from "./templates";

const node = (name: string, kind: "file" | "folder" = "file"): FileNode => ({
  id: crypto.randomUUID(),
  parentId: null,
  kind,
  name,
  mime: null,
  size: null,
  version: kind === "file" ? 1 : null,
  createdAt: "2026-10-24T10:00:00Z",
  updatedAt: "2026-10-24T10:00:00Z",
  trashedAt: null,
  role: "owner",
});

describe("own templates", () => {
  it("come from the folder Vorlagen at the top, whatever its case", () => {
    const folder = node("vorlagen", "folder");
    expect(templateFolderOf([node("Vorlagen.docx"), folder])).toBe(folder);
    expect(templateFolderOf([node("Briefe", "folder")])).toBeNull();
  });

  it("are the documents, spreadsheets and presentations in it", () => {
    const choices = ownTemplates([
      node("Briefbogen.docx"),
      node("Logo.png"),
      node("Formular.pdf"),
      node("Preise.xlsx"),
    ]);
    expect(choices.map((choice) => [choiceName(choice), formatOf(choice)])).toEqual([
      ["Briefbogen", "docx"],
      ["Preise", "xlsx"],
    ]);
  });
});

describe("the new file's name", () => {
  it("gets the template's extension once", () => {
    expect(fileNameFor("Rechnung 2026-001", "docx")).toBe("Rechnung 2026-001.docx");
    expect(fileNameFor("Plan.XLSX", "xlsx")).toBe("Plan.XLSX");
  });

  it("is refused when nothing but the extension would be left", () => {
    for (const typed of ["", "   ", ".docx", "  .DOCX"]) {
      expect(nodeNameSchema.safeParse(fileNameFor(typed, "docx")).success).toBe(false);
    }
  });

  it("starts as the template's name", () => {
    const [first] = TEMPLATES;
    if (!first) throw new Error("no templates");
    expect(choiceName({ kind: "builtin", template: first })).toBe(first.name);
  });
});
