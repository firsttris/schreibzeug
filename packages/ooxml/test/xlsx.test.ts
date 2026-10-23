import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { blankXlsx, columnName, xlsx } from "../src";

const part = (bytes: Uint8Array, path: string): string => {
  const data = unzipSync(bytes)[path];
  if (!data) throw new Error(`${path} missing`);
  return strFromU8(data);
};

describe("xlsx", () => {
  it("writes the parts a spreadsheet program needs, with one German-named sheet", () => {
    const blank = blankXlsx();
    expect(Object.keys(unzipSync(blank)).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(part(blank, "xl/workbook.xml")).toContain('<sheet name="Tabelle1" sheetId="1" r:id="rId1"/>');
  });

  it("writes numbers, texts and formulas into their cells", () => {
    const sheet = part(
      xlsx([
        {
          name: "Zahlen",
          rows: [
            ["Menge", 3],
            ["Preis & Co", "=B1*2"],
          ],
        },
      ]),
      "xl/worksheets/sheet1.xml",
    );
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Menge</t></is></c>');
    expect(sheet).toContain('<c r="B1"><v>3</v></c>');
    expect(sheet).toContain("Preis &amp; Co");
    expect(sheet).toContain('<c r="B2"><f>B1*2</f></c>');
  });

  it("writes column widths before the cells", () => {
    const sheet = part(xlsx([{ name: "A", rows: [[1]], widths: [20, 8.5] }]), "xl/worksheets/sheet1.xml");
    expect(sheet).toContain(
      '<cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="8.5" customWidth="1"/></cols><sheetData>',
    );
  });

  it("links every sheet", () => {
    const bytes = xlsx([
      { name: "Eins", rows: [] },
      { name: "Zwei", rows: [] },
    ]);
    expect(part(bytes, "xl/_rels/workbook.xml.rels")).toContain('Target="worksheets/sheet2.xml"');
    expect(part(bytes, "[Content_Types].xml")).toContain('PartName="/xl/worksheets/sheet2.xml"');
  });

  it("names columns as spreadsheets do", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });

  it("gives the same bytes for the same content", () => {
    expect(blankXlsx()).toEqual(blankXlsx());
  });
});
