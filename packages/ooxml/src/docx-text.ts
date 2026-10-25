import { strFromU8, unzipSync } from "fflate";

/** A paragraph's text, or a table as rows of cell texts (a cell's paragraphs joined by "\n"). */
export type DocxBlock = { type: "paragraph"; text: string } | { type: "table"; rows: string[][] };

/** What a Word document says, in order: the body, and its headers and footers. */
export type DocxContent = { body: DocxBlock[]; headers: DocxBlock[]; footers: DocxBlock[] };

/*
 * WordprocessingML (ECMA-376 Part 1): text is in <w:t> inside runs inside paragraphs <w:p>;
 * tables are <w:tbl> → rows <w:tr> → cells <w:tc>, whose content is paragraphs again (17.4).
 * <w:tab/> and <w:br/>/<w:cr/> are a tab and a line break. Deleted text (<w:delText>) and
 * field codes (<w:instrText>) are not text a reader sees, so they are left out.
 */
const TOKEN = /<(\/?)w:(p|tbl|tr|tc|t|tab|br|cr)(?=[\s/>])[^>]*?(\/?)>/g;

const unescapeXml = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");

type Table = { rows: string[][]; cell: string[] | null };

/** The blocks of one part (document.xml, a header, a footer). */
export const blocksOf = (xml: string): DocxBlock[] => {
  const blocks: DocxBlock[] = [];
  const tables: Table[] = [];
  let paragraph: string | null = null;
  let textFrom = -1;

  const finishParagraph = (text: string) => {
    const table = tables.at(-1);
    if (table?.cell) table.cell.push(text);
    else if (tables.length === 0) blocks.push({ type: "paragraph", text });
  };

  for (const match of xml.matchAll(TOKEN)) {
    const [whole, closing, tag, selfClosing] = match;
    const at = match.index ?? 0;
    if (tag === "t") {
      if (closing && textFrom >= 0 && paragraph !== null) paragraph += unescapeXml(xml.slice(textFrom, at));
      textFrom = closing || selfClosing ? -1 : at + whole.length;
    } else if (tag === "tab" && paragraph !== null) paragraph += "\t";
    else if ((tag === "br" || tag === "cr") && paragraph !== null) paragraph += "\n";
    else if (tag === "p") {
      if (selfClosing) finishParagraph("");
      else if (closing) {
        finishParagraph(paragraph ?? "");
        paragraph = null;
      } else paragraph = "";
    } else if (tag === "tbl") {
      if (!closing) tables.push({ rows: [], cell: null });
      else {
        const table = tables.pop();
        if (!table) continue;
        const outer = tables.at(-1);
        // A table inside a cell becomes lines of that cell.
        if (outer?.cell) outer.cell.push(...table.rows.map((row) => row.join("\t")));
        else if (!outer) blocks.push({ type: "table", rows: table.rows });
      }
    } else if (tag === "tr" && !closing) tables.at(-1)?.rows.push([]);
    else if (tag === "tc") {
      const table = tables.at(-1);
      if (!table) continue;
      if (!closing) table.cell = [];
      else {
        table.rows.at(-1)?.push((table.cell ?? []).join("\n"));
        table.cell = null;
      }
    }
  }
  return blocks;
};

const partsLike = (files: Record<string, Uint8Array>, pattern: RegExp): DocxBlock[] =>
  Object.keys(files)
    .filter((path) => pattern.test(path))
    .sort()
    .flatMap((path) => blocksOf(strFromU8(files[path] ?? new Uint8Array())));

/** The text of a .docx: its body, headers and footers, as paragraphs and tables. */
export const docxContent = (docx: Uint8Array): DocxContent => {
  const files = unzipSync(docx, {
    filter: (file) => file.name.startsWith("word/") && file.name.endsWith(".xml"),
  });
  return {
    body: partsLike(files, /^word\/document\.xml$/),
    headers: partsLike(files, /^word\/header\d*\.xml$/),
    footers: partsLike(files, /^word\/footer\d*\.xml$/),
  };
};
