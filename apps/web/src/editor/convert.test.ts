import { describe, expect, it } from "vitest";
import { copyNameFor, legacyPlanOf } from "./convert";

describe("older formats", () => {
  it("plans each into the Office format it belongs to", () => {
    expect(legacyPlanOf("Angebot.DOC")).toEqual({ from: "doc", to: "docx", label: "Word 97–2003" });
    expect(legacyPlanOf("Brief.rtf")).toMatchObject({ to: "docx" });
    expect(legacyPlanOf("Preise.xls")).toMatchObject({ to: "xlsx" });
    expect(legacyPlanOf("Vortrag.ppt")).toMatchObject({ to: "pptx" });
    expect(legacyPlanOf("Angebot.docx")).toBeNull();
  });

  it("names the copy beside the file, without taking a name that is there", () => {
    expect(copyNameFor("Angebot.doc", "docx", new Set())).toBe("Angebot.docx");
    expect(copyNameFor("Angebot.doc", "docx", new Set(["angebot.DOCX", "Angebot (2).docx"]))).toBe(
      "Angebot (3).docx",
    );
  });
});
