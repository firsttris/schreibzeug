import { strFromU8, unzipSync } from "fflate";

/**
 * A paragraph's text, or a table as rows of cell texts (a cell's paragraphs joined by "\n"). A
 * paragraph says, when it is one, that it is a heading (level 1–9) or an item of a list (its level
 * from 0).
 */
export type DocxBlock =
  | { type: "paragraph"; text: string; heading?: number; list?: number }
  | { type: "table"; rows: string[][] };

/** What a Word document says, in order: the body, and its headers and footers. */
export type DocxContent = { body: DocxBlock[]; headers: DocxBlock[]; footers: DocxBlock[] };

/*
 * WordprocessingML (ECMA-376 Part 1): text is in <w:t> inside runs inside paragraphs <w:p>;
 * tables are <w:tbl> → rows <w:tr> → cells <w:tc>, whose content is paragraphs again (17.4).
 * <w:tab/> and <w:br/>/<w:cr/> are a tab and a line break. Deleted text (<w:delText>) and
 * field codes (<w:instrText>) are not text a reader sees, so they are left out.
 */
const TOKEN = /<(\/?)w:(p|tbl|tr|tc|t|tab|br|cr|pStyle|ilvl|numId)(?=[\s/>])[^>]*?(\/?)>/g;

/** The value of an element's w:val attribute. */
const valAttribute = (tag: string): string | undefined => /\sw:val="([^"]*)"/.exec(tag)?.[1];

/**
 * Heading levels by style id, from styles.xml: a paragraph style with an outline level
 * (<w:outlineLvl>, 17.3.1.20) is a heading of that level plus one. Word's own heading styles carry
 * one; a style named "heading n" or "Title" without one counts too.
 */
export const headingStyles = (stylesXml: string): Map<string, number> => {
  const levels = new Map<string, number>();
  for (const [style, attributes = ""] of stylesXml.matchAll(/<w:style\b([^>]*)>[\s\S]*?<\/w:style>/g)) {
    const id = /w:styleId="([^"]*)"/.exec(attributes)?.[1];
    if (!id || !/w:type="paragraph"/.test(attributes)) continue;
    const outline = /<w:outlineLvl\b[^>]*w:val="(\d)"/.exec(style)?.[1];
    const name = /<w:name\b[^>]*w:val="([^"]*)"/.exec(style)?.[1]?.toLowerCase() ?? "";
    const level =
      outline !== undefined
        ? Number(outline) + 1
        : (/^heading (\d)$/.exec(name)?.[1] ?? (name === "title" ? "1" : null));
    if (level !== null && Number(level) <= 9) levels.set(id, Number(level));
  }
  return levels;
};

/** Without styles.xml: Word's ids for its heading styles, in English and German. */
const headingByName = (style: string): number | undefined => {
  const level = /^(?:heading|berschrift|überschrift)(\d)$/i.exec(style)?.[1];
  return level ? Number(level) : /^(?:title|titel)$/i.test(style) ? 1 : undefined;
};

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

/** The blocks of one part (document.xml, a header, a footer); `headings` from `headingStyles`. */
export const blocksOf = (xml: string, headings: Map<string, number> = new Map()): DocxBlock[] => {
  const blocks: DocxBlock[] = [];
  const tables: Table[] = [];
  let paragraph: string | null = null;
  let style: string | undefined;
  let listLevel: number | undefined;
  let textFrom = -1;

  const finishParagraph = (text: string) => {
    const table = tables.at(-1);
    if (table?.cell) table.cell.push(text);
    else if (tables.length === 0) {
      const heading = style === undefined ? undefined : (headings.get(style) ?? headingByName(style));
      blocks.push({
        type: "paragraph",
        text,
        ...(heading === undefined ? {} : { heading }),
        ...(listLevel === undefined || heading !== undefined ? {} : { list: listLevel }),
      });
    }
    style = undefined;
    listLevel = undefined;
  };

  for (const match of xml.matchAll(TOKEN)) {
    const [whole, closing, tag, selfClosing] = match;
    const at = match.index ?? 0;
    if (tag === "t") {
      if (closing && textFrom >= 0 && paragraph !== null) paragraph += unescapeXml(xml.slice(textFrom, at));
      textFrom = closing || selfClosing ? -1 : at + whole.length;
    } else if (tag === "pStyle" && paragraph !== null) style = valAttribute(whole);
    else if (tag === "ilvl" && paragraph !== null) listLevel = Number(valAttribute(whole) ?? 0);
    // A numbering of 0 takes a list away (17.9.18); without <w:ilvl> an item is on level 0.
    else if (tag === "numId" && paragraph !== null)
      listLevel = valAttribute(whole) === "0" ? undefined : (listLevel ?? 0);
    else if (tag === "tab" && paragraph !== null) paragraph += "\t";
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

const partsLike = (
  files: Record<string, Uint8Array>,
  pattern: RegExp,
  headings: Map<string, number>,
): DocxBlock[] =>
  Object.keys(files)
    .filter((path) => pattern.test(path))
    .sort()
    .flatMap((path) => blocksOf(strFromU8(files[path] ?? new Uint8Array()), headings));

/** The text of a .docx: its body, headers and footers, as paragraphs and tables. */
export const docxContent = (docx: Uint8Array): DocxContent => {
  const files = unzipSync(docx, {
    filter: (file) => file.name.startsWith("word/") && file.name.endsWith(".xml"),
  });
  const styles = files["word/styles.xml"];
  const headings = styles ? headingStyles(strFromU8(styles)) : new Map<string, number>();
  return {
    body: partsLike(files, /^word\/document\.xml$/, headings),
    headers: partsLike(files, /^word\/header\d*\.xml$/, headings),
    footers: partsLike(files, /^word\/footer\d*\.xml$/, headings),
  };
};
