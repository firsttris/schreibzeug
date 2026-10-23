import { describe, expect, it } from "vitest";
import { fileNameFor } from "./opened-file";

describe("fileNameFor", () => {
  it.each([
    ["Angebot.docx", "docx", "Angebot.docx"],
    ["Angebot.DOCX", "docx", "Angebot.DOCX"],
    ["Angebot.doc", "docx", "Angebot.docx"],
    ["Angebot", "docx", "Angebot.docx"],
    ["Zahlen.xls", "xlsx", "Zahlen.xlsx"],
    ["Zahlen.xlsx", "xlsx", "Zahlen.xlsx"],
  ] as const)("turns %s (%s) into %s", (input, format, expected) => {
    expect(fileNameFor(input, format)).toBe(expected);
  });
});
