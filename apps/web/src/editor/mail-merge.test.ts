import { describe, expect, it } from "vitest";
import { isRecipientTable, mergedNameFor, missingFields, recipientsOf, tableOf } from "./mail-merge";

describe("mail merge recipients", () => {
  it("takes the rows of the header's width and leaves out empty rows", () => {
    expect(
      recipientsOf("Kunden.xlsx", [["Name ", "Ort"], ["Anna", "Bühl", "zu viel"], ["", " "], ["Ben"]]),
    ).toEqual({
      ok: true,
      recipients: {
        source: "Kunden.xlsx",
        rows: [
          ["Name", "Ort"],
          ["Anna", "Bühl"],
          ["Ben", ""],
        ],
      },
    });
  });

  it("says what a table lacks", () => {
    expect(recipientsOf("a.csv", [])).toMatchObject({
      ok: false,
      error: expect.stringContaining("erste Zeile"),
    });
    expect(recipientsOf("a.csv", [["Name"]])).toMatchObject({
      ok: false,
      error: expect.stringContaining("keine Empfänger"),
    });
    expect(
      recipientsOf("a.csv", [
        ["Name", ""],
        ["Anna", "x"],
      ]),
    ).toEqual({
      ok: false,
      error: "Spalte 2 hat in der ersten Zeile keinen Namen.",
    });
  });

  it("reads a CSV and an .xlsx itself and has the converter turn others into an .xlsx", async () => {
    const neverConvert = async () => {
      throw new Error("no conversion expected");
    };
    const csv = new TextEncoder().encode("Name;Ort\r\nAnna;Bühl\r\n");
    expect(await tableOf("Kunden.CSV", csv, neverConvert)).toEqual([
      ["Name", "Ort"],
      ["Anna", "Bühl"],
    ]);
    await expect(tableOf("Kunden.ods", new Uint8Array(), neverConvert)).rejects.toThrow(
      "no conversion expected",
    );
    await expect(tableOf("Kunden.pdf", new Uint8Array(), neverConvert)).rejects.toThrow("aus einer Tabelle");
  });

  it("names the fields the recipients lack, the table files and the letters' file", () => {
    const recipients = { source: "k.csv", rows: [["Name", "Ort"]] };
    expect(missingFields(["Name", "Anrede"], recipients)).toEqual(["Anrede"]);
    expect(isRecipientTable("Kunden.xlsx")).toBe(true);
    expect(isRecipientTable("Brief.docx")).toBe(false);
    expect(mergedNameFor("Einladung.docx")).toBe("Einladung – Serienbrief.docx");
  });
});
