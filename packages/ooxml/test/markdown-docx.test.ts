import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxContent, markdownDocx, markdownParagraphs } from "../src";
import { inlineSegments, markdownBlocks } from "../src/markdown-docx";

const part = (bytes: Uint8Array, path: string): string =>
  strFromU8(unzipSync(bytes)[path] ?? new Uint8Array());

const MARKDOWN = `# Angebot für Musterhandel

Sehr geehrte Damen und Herren,
wir bieten **Folgendes** an:

- Beratung *vor Ort*
  - zwei Tage
- Schulung

1. Erstens
2. Zweitens

| Position | Preis |
| --- | ---: |
| Scanner | 189,00 € |
| A \\| B | 1 € |

> Gültig bis 30.11.2026

---

Mehr unter [unserer Seite](https://example.org/?a=1&b=2).

\`\`\`
const x = 1;
\`\`\`
`;

describe("markdownDocx", () => {
  it("writes headings, lists and tables that read back as such", () => {
    const { body } = docxContent(markdownDocx(MARKDOWN));
    expect(body).toEqual([
      { type: "paragraph", text: "Angebot für Musterhandel", heading: 1 },
      { type: "paragraph", text: "Sehr geehrte Damen und Herren, wir bieten Folgendes an:" },
      { type: "paragraph", text: "Beratung vor Ort", list: 0 },
      { type: "paragraph", text: "zwei Tage", list: 1 },
      { type: "paragraph", text: "Schulung", list: 0 },
      { type: "paragraph", text: "Erstens", list: 0 },
      { type: "paragraph", text: "Zweitens", list: 0 },
      {
        type: "table",
        rows: [
          ["Position", "Preis"],
          ["Scanner", "189,00 €"],
          ["A | B", "1 €"],
        ],
      },
      { type: "paragraph", text: "" },
      { type: "paragraph", text: "Gültig bis 30.11.2026" },
      { type: "paragraph", text: "" },
      { type: "paragraph", text: "Mehr unter unserer Seite." },
      { type: "paragraph", text: "const x = 1;" },
    ]);
  });

  it("marks bold, italic and code, and links to their targets", () => {
    const bytes = markdownDocx(MARKDOWN);
    const document = part(bytes, "word/document.xml");
    expect(document).toContain('<w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Folgendes</w:t>');
    expect(document).toContain('<w:hyperlink r:id="rIdLink1" w:history="1">');
    expect(part(bytes, "word/_rels/document.xml.rels")).toContain(
      'Target="https://example.org/?a=1&amp;b=2" TargetMode="External"',
    );
    expect(part(bytes, "word/numbering.xml")).toContain('<w:num w:numId="2"><w:abstractNumId w:val="1"/>');
    expect(part(bytes, "[Content_Types].xml")).toContain("/word/numbering.xml");
  });

  it("numbers each numbered list from one", () => {
    const blocks = markdownBlocks("1. a\n2. b\n\nText\n\n1. c");
    expect(blocks.filter((block) => block.type === "item").map((block) => block.list)).toEqual([1, 1, 2]);
    expect(part(markdownDocx("1. a\n\nText\n\n1. c"), "word/numbering.xml")).toContain('<w:num w:numId="3">');
  });

  it("reads inline marks, nested and escaped", () => {
    expect(inlineSegments("**fett _und kursiv_** \\*kein\\* `a*b*`")).toEqual([
      { bold: true, text: "fett " },
      { bold: true, italic: true, text: "und kursiv" },
      { text: " *kein* " },
      { code: true, text: "a*b*" },
    ]);
  });

  it("gives a document with one empty paragraph for no text", () => {
    expect(docxContent(markdownDocx("")).body).toEqual([{ type: "paragraph", text: "" }]);
  });
});

describe("markdownParagraphs", () => {
  it("gives headings, paragraphs and list items with their marks, tables as lines", () => {
    expect(
      markdownParagraphs(
        "## Ziel\n\nText mit **fett**\n\n1. eins\n  - unter\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n---",
      ),
    ).toEqual([
      { kind: "heading", level: 2, runs: [{ text: "Ziel" }] },
      { kind: "paragraph", level: 0, runs: [{ text: "Text mit " }, { text: "fett", bold: true }] },
      { kind: "number", level: 0, runs: [{ text: "eins" }] },
      { kind: "bullet", level: 1, runs: [{ text: "unter" }] },
      { kind: "paragraph", level: 0, runs: [{ text: "a\tb" }] },
      { kind: "paragraph", level: 0, runs: [{ text: "1\t2" }] },
    ]);
  });
});

describe("Markdown as CommonMark reads it", () => {
  it("leaves an empty header cell empty", () => {
    const [table] = docxContent(markdownDocx("|  | Q1 |\n| --- | --- |\n| a | 1 |")).body;
    expect(table).toEqual({
      type: "table",
      rows: [
        ["", "Q1"],
        ["a", "1"],
      ],
    });
  });

  it("keeps an indented continuation line in its item, so the numbering goes on", () => {
    expect(markdownBlocks("1. First\n   more about it\n2. Second\n")).toEqual([
      { type: "item", ordered: true, level: 0, text: "First more about it", list: 1 },
      { type: "item", ordered: true, level: 0, text: "Second", list: 1 },
    ]);
    const document = part(markdownDocx("1. First\n   more about it\n2. Second\n"), "word/document.xml");
    expect(new Set([...document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]))).toEqual(
      new Set(["2"]),
    );
  });

  it("strips closing hashes only after a space", () => {
    expect(markdownBlocks("## Using C#")).toEqual([{ type: "heading", level: 2, text: "Using C#" }]);
    expect(markdownBlocks("## Titel ##")).toEqual([{ type: "heading", level: 2, text: "Titel" }]);
  });

  it("takes underscores inside words literally", () => {
    expect(inlineSegments("set my_var_name and https://x.org/a_b_c")).toEqual([
      { text: "set my_var_name and https://x.org/a_b_c" },
    ]);
    expect(inlineSegments("ein _kursives_ Wort und __fett__")).toEqual([
      { text: "ein " },
      { italic: true, text: "kursives" },
      { text: " Wort und " },
      { bold: true, text: "fett" },
    ]);
  });
});
