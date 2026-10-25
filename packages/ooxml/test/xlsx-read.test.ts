import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { xlsx, xlsxRows, xlsxSheets } from "../src";

describe("xlsxRows", () => {
  it("reads the sheets the package writes, formulas as their values where cached", () => {
    const bytes = xlsx([
      {
        name: "Kunden",
        rows: [
          ["Name", "Ort", "Betrag"],
          ["Anna Berger", "Bühl", 1234.5],
          ["Ben & Co.", "Baden-Baden", 7],
        ],
      },
      { name: "Zweites", rows: [["nicht gelesen"]] },
    ]);
    expect(xlsxRows(bytes)).toEqual([
      ["Name", "Ort", "Betrag"],
      ["Anna Berger", "Bühl", "1234,5"],
      ["Ben & Co.", "Baden-Baden", "7"],
    ]);
  });

  it("reads shared and inline strings, rich text, booleans and dates, and keeps gaps", () => {
    const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Datum</t></is></c></row>
      <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="b"><v>1</v></c><c r="C3" s="1"><v>46318</v></c><c r="D3" s="2"><v>45000.75</v></c><c r="E3"/></row>
      <row r="4"><c r="A4" t="str"><f>A1&amp;"!"</f><v>Name!</v></c></row>
      <row r="5"><c r="A5"/></row>
    </sheetData></worksheet>`;
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
      "xl/sharedStrings.xml": strToU8(
        '<sst><si><t>Name</t></si><si><r><t>Fr</t></r><r><rPr><b/></rPr><t xml:space="preserve">au Müller</t></r><rPh><t>x</t></rPh></si></sst>',
      ),
      "xl/styles.xml": strToU8(
        '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="[$-407]dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>',
      ),
    });
    expect(xlsxRows(bytes)).toEqual([
      ["Name", "", "Datum"],
      [],
      ["Frau Müller", "WAHR", "23.10.2026", "15.03.2023"],
      ["Name!"],
    ]);
  });
});

describe("xlsxSheets", () => {
  it("reads every sheet by its name, in the order of the tabs", () => {
    const bytes = xlsx([
      {
        name: "Preise & Mengen",
        rows: [
          ["Artikel", "Preis"],
          ["Stift", 1.5],
        ],
      },
      { name: "Leer", rows: [] },
      { name: "Notizen", rows: [["Hallo"]] },
    ]);
    expect(xlsxSheets(bytes)).toEqual([
      {
        name: "Preise & Mengen",
        rows: [
          ["Artikel", "Preis"],
          ["Stift", "1,5"],
        ],
      },
      { name: "Leer", rows: [] },
      { name: "Notizen", rows: [["Hallo"]] },
    ]);
  });
});

describe("empty rows written as <row/>", () => {
  it("keep the rows below them in their place", () => {
    const files = unzipSync(xlsx([{ name: "S", rows: [["a"], [], ["c"]] }]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
    files["xl/worksheets/sheet1.xml"] = strToU8(
      sheet.replace('<row r="2"></row>', '<row r="2" ht="30" customHeight="1"/>'),
    );
    expect(xlsxSheets(zipSync(files))[0]?.rows).toEqual([["a"], [], ["c"]]);
  });
});
