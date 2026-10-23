import { describe, expect, it } from "vitest";
import { docxName } from "./files";

describe("docxName", () => {
  it.each([
    ["Angebot.docx", "Angebot.docx"],
    ["Angebot.DOCX", "Angebot.DOCX"],
    ["Angebot.doc", "Angebot.docx"],
    ["Angebot", "Angebot.docx"],
  ])("turns %s into %s", (input, expected) => {
    expect(docxName(input)).toBe(expected);
  });
});
