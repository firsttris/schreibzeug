import { describe, expect, it } from "vitest";
import { docxContent, fillPlaceholders, markdownDocx, placeholdersOf, TEMPLATES, xlsxSheets } from "../src";

const template = (id: string) => {
  const found = TEMPLATES.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found.bytes();
};

describe("fillPlaceholders", () => {
  it("fills the placeholders of a built-in template, escaped, every time they occur", () => {
    const invoice = template("rechnung");
    expect(placeholdersOf(invoice)).toEqual(expect.arrayContaining(["Nr.", "Datum", "Firma"]));
    const { bytes, missing, left } = fillPlaceholders(invoice, {
      "Nr.": "2026-042",
      Firma: "Müller & Söhne <GmbH>",
      Gibtsnicht: "x",
    });
    const text = JSON.stringify(docxContent(bytes));
    expect(text).toContain("2026-042");
    expect(text).toContain("Müller & Söhne <GmbH>");
    expect(text).not.toContain("[Nr.]");
    expect(text).not.toContain("[Firma]");
    expect(missing).toEqual(["Gibtsnicht"]);
    expect(left).toContain("Datum");
    expect(left).not.toContain("Firma");
  });

  it("fills spreadsheets and presentations too", () => {
    const plan = fillPlaceholders(template("projektplan"), { "Aufgabe 1": "Konzept" });
    expect(JSON.stringify(xlsxSheets(plan.bytes))).toContain("Konzept");
    const deck = fillPlaceholders(template("praesentation"), { Titel: "Lagerverwaltung" });
    expect(deck.missing).toEqual([]);
    expect(placeholdersOf(deck.bytes)).not.toContain("Titel");
  });
});

describe("placeholders with & < >", () => {
  it("are named as written, and filled by that name", () => {
    const document = markdownDocx("Firma: [Firma & Co]");
    expect(placeholdersOf(document)).toEqual(["Firma & Co"]);
    const filled = fillPlaceholders(document, { "Firma & Co": "Müller" });
    expect(filled).toMatchObject({ missing: [], left: [] });
  });
});
