import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../src/templates";

const part = (bytes: Uint8Array, path: string) => strFromU8(unzipSync(bytes)[path] ?? new Uint8Array());

const template = (id: string) => {
  const found = TEMPLATES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no template ${id}`);
  return found;
};

describe("the templates", () => {
  it("have ids, names and formats of their own", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(TEMPLATES.map((t) => t.format).sort()).toEqual(["docx", "docx", "docx", "pptx", "xlsx", "xlsx"]);
  });

  it("are valid packages of their format", () => {
    const mainPart = { docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" };
    for (const t of TEMPLATES) expect(part(t.bytes(), mainPart[t.format])).toContain("<?xml");
  });

  it("write a letter with the address field and placeholders to fill in", () => {
    const xml = part(template("brief").bytes(), "word/document.xml");
    expect(xml).toContain("[Empfänger]");
    expect(xml).toContain("Mit freundlichen Grüßen");
  });

  it("give the invoice what § 14 UStG asks for", () => {
    const xml = part(template("rechnung").bytes(), "word/document.xml");
    for (const field of [
      "Rechnungsnummer",
      "Leistungszeitraum",
      "Steuernummer",
      "Umsatzsteuer 19 %",
      "<w:tbl>",
    ])
      expect(xml).toContain(field);
  });

  it("calculate the totals with formulas and euro formats", () => {
    const bytes = template("kalkulation").bytes();
    const sheet = part(bytes, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain("<f>B2*C2</f>");
    expect(sheet).toContain("<f>SUM(D2:D6)</f>");
    expect(sheet).toMatch(/<c r="D8" s="3"><f>/);
    expect(part(bytes, "xl/styles.xml")).toContain('formatCode="#,##0.00\\ &quot;€&quot;"');
  });
});
