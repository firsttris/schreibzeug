import { describe, expect, it } from "vitest";
import { blocksMarkdown, pageOf, tableMarkdown } from "../src/markdown";
import { pagesWanted } from "../src/pdf-text";

describe("blocksMarkdown", () => {
  it("writes headings, lists, paragraphs and tables, without empty paragraphs", () => {
    expect(
      blocksMarkdown([
        { type: "paragraph", text: "Angebot", heading: 1 },
        { type: "paragraph", text: "" },
        { type: "paragraph", text: "Eins", list: 0 },
        { type: "paragraph", text: "Unter", list: 1 },
        { type: "paragraph", text: "Danach" },
        { type: "table", rows: [["A", "B|C"], ["zwei\nZeilen"]] },
      ]),
    ).toBe("# Angebot\n\n- Eins\n  - Unter\n\nDanach\n\n| A | B\\|C |\n| --- | --- |\n| zwei<br>Zeilen |  |");
  });

  it("leaves out empty headings and list items", () => {
    expect(
      blocksMarkdown([
        { type: "paragraph", text: "", heading: 1 },
        { type: "paragraph", text: "Text" },
        { type: "paragraph", text: " ", list: 0 },
      ]),
    ).toBe("Text");
  });

  it("caps headings at six levels", () => {
    expect(tableMarkdown([[]])).toBe("|  |\n| --- |");
    expect(blocksMarkdown([{ type: "paragraph", text: "Tief", heading: 9 }])).toBe("###### Tief");
  });
});

describe("pageOf", () => {
  it("answers a short text whole and a long one in parts, cut at a line", () => {
    expect(pageOf("kurz")).toBe("kurz");
    const text = "abcdefghi\n".repeat(10);
    const first = pageOf(text, 0, 25);
    expect(first).toBe("abcdefghi\nabcdefghi\n\n\n[Zeichen 0–20 von 100. Weiter mit offset=20.]");
    expect(pageOf(text, 90, 25)).toBe("abcdefghi\n\n\n[Zeichen 90–100 von 100, Ende.]");
  });
});

describe("pagesWanted", () => {
  it("reads single pages, ranges and lists", () => {
    const wanted = pagesWanted("2, 4-5");
    expect([1, 2, 3, 4, 5, 6].filter((page) => wanted?.(page))).toEqual([2, 4, 5]);
    expect(pagesWanted(undefined)?.(99)).toBe(true);
    expect(pagesWanted("eins")).toBeNull();
  });
});
