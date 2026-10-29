import { describe, expect, it } from "vitest";
import { engineTexts, tableColumnHeading, textEditorTexts } from "./engine-texts";

describe("the engine's texts", () => {
  it("give each editor the engine texts it draws, by their English text, and the screen reader's words", () => {
    expect(engineTexts("slide").translate).toMatchObject({
      "Click to add notes": "Klicken, um Notizen hinzuzufügen",
    });
    expect(engineTexts("cell").translate).toMatchObject({
      "Grand Total": "Gesamtergebnis",
      space: "Leerzeichen",
    });
    expect(engineTexts("word").translate).toEqual(expect.objectContaining({ "empty cell": "leere Zelle" }));
    expect(engineTexts("word").translate).not.toHaveProperty("Header");
    expect(engineTexts("pdf").translate).toEqual({});
  });

  it("name a pivot value as German Excel does", () => {
    expect(engineTexts("cell").pivotValueName("average", "Betrag")).toBe("Mittelwert von Betrag");
  });

  it("give the text editor its words and a table's headings", () => {
    expect(textEditorTexts()).toMatchObject({ lang: "de", phrases: { Find: "Suchen" } });
    expect(tableColumnHeading(2)).toBe("Spalte 2");
  });
});
