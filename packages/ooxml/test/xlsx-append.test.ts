import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { appendRows, xlsx, xlsxSheets } from "../src";

describe("appendRows", () => {
  const workbook = () =>
    xlsx([
      {
        name: "Preise",
        rows: [
          ["Artikel", "Preis"],
          ["Stift", 1.5],
        ],
      },
      { name: "Leer", rows: [] },
    ]);

  it("adds rows below the last one of the sheet asked for", () => {
    const result = appendRows(
      workbook(),
      [
        ["Block", 2.25],
        ["Summe", "=SUM(B2:B3)"],
      ],
      "Preise",
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({ sheet: "Preise", firstRow: 3, lastRow: 4 });
    expect(xlsxSheets(result.value.bytes)[0]?.rows).toEqual([
      ["Artikel", "Preis"],
      ["Stift", "1,5"],
      ["Block", "2,25"],
      ["Summe"],
    ]);
    const sheet = strFromU8(unzipSync(result.value.bytes)["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
    expect(sheet).toContain('<c r="B4"><f>SUM(B2:B3)</f></c>');
  });

  it("starts an empty sheet at row 1, and keeps a stated used range in step", () => {
    const result = appendRows(workbook(), [["eins"]], "Leer");
    if (!result.ok) throw new Error(result.error);
    expect(result.value.firstRow).toBe(1);
    expect(xlsxSheets(result.value.bytes)[1]?.rows).toEqual([["eins"]]);

    const files = unzipSync(workbook());
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
    files["xl/worksheets/sheet1.xml"] = strToU8(
      sheet.replace("<sheetData>", '<dimension ref="A1:B2"/><sheetData>'),
    );
    const withDimension = appendRows(zipSync(files), [["a", "b", "c"]]);
    if (!withDimension.ok) throw new Error(withDimension.error);
    const written = strFromU8(
      unzipSync(withDimension.value.bytes)["xl/worksheets/sheet1.xml"] ?? new Uint8Array(),
    );
    expect(written).toContain('<dimension ref="A1:C3"/>');
  });

  it("names the sheets when the one asked for is not there", () => {
    expect(appendRows(workbook(), [["x"]], "Kosten")).toEqual({
      ok: false,
      error: "Ein Blatt „Kosten“ gibt es nicht. Blätter: „Preise“, „Leer“.",
    });
  });
});
