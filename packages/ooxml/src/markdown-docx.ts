import { docx, hyperlinkId } from "./docx";
import { escapeXml } from "./zip";

/*
 * A Word document from Markdown: what Claude writes most naturally becomes a real .docx with Word's
 * own heading, list and table structures, so the result opens, reads and edits like a document
 * made by hand. Covered: ATX headings, paragraphs, **bold**, *italic*, `code`, [links](url),
 * bullet and numbered lists (nested by indent), pipe tables, block quotes, fenced code and
 * horizontal rules. WordprocessingML: ECMA-376 Part 1, 17.
 */

type Marks = { bold?: boolean; italic?: boolean; code?: boolean; link?: string };
type Segment = Marks & { text: string };

/**
 * Inline Markdown: emphasis, code and links, nested; a backslash takes the next character literally.
 * As in CommonMark, "_" marks emphasis only at word bounds, so my_var_name stays as it is.
 */
const INLINE =
  /\\(?<escaped>[\\`*_[\]()#+\-.!|>])|`(?<code>[^`]+)`|\*\*(?=\S)(?<strongStar>[\s\S]+?)(?<=\S)\*\*|(?<![\p{L}\p{N}_])__(?=\S)(?<strongUnder>[\s\S]+?)(?<=\S)__(?![\p{L}\p{N}_])|\*(?=\S)(?<emStar>[\s\S]+?)(?<=\S)\*|(?<![\p{L}\p{N}_])_(?=\S)(?<emUnder>[\s\S]+?)(?<=\S)_(?![\p{L}\p{N}_])|\[(?<label>[^\]]+)\]\((?<target>[^)\s]+)\)/gu;

export const inlineSegments = (text: string, marks: Marks = {}): Segment[] => {
  const segments: Segment[] = [];
  let from = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > from) segments.push({ ...marks, text: text.slice(from, at) });
    const { escaped, code, strongStar, strongUnder, emStar, emUnder, label, target } = match.groups ?? {};
    const strong = strongStar ?? strongUnder;
    const emphasis = emStar ?? emUnder;
    if (escaped !== undefined) segments.push({ ...marks, text: escaped });
    else if (code !== undefined) segments.push({ ...marks, code: true, text: code });
    else if (strong !== undefined) segments.push(...inlineSegments(strong, { ...marks, bold: true }));
    else if (emphasis !== undefined) segments.push(...inlineSegments(emphasis, { ...marks, italic: true }));
    else if (label !== undefined && target !== undefined)
      segments.push(...inlineSegments(label, { ...marks, link: target }));
    from = at + match[0].length;
  }
  if (from < text.length) segments.push({ ...marks, text: text.slice(from) });
  // Neighbours with the same marks become one run.
  return segments.reduce<Segment[]>((joined, segment) => {
    const last = joined.at(-1);
    const same =
      last &&
      last.bold === segment.bold &&
      last.italic === segment.italic &&
      last.code === segment.code &&
      last.link === segment.link;
    if (same) last.text += segment.text;
    else joined.push({ ...segment });
    return joined;
  }, []);
};

const runXml = ({ text, bold, italic, code, link }: Segment): string => {
  const properties = [
    link ? '<w:rStyle w:val="Hyperlink"/>' : "",
    code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : "",
    bold ? "<w:b/><w:bCs/>" : "",
    italic ? "<w:i/><w:iCs/>" : "",
  ].join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
};

/** The runs of a line of inline Markdown; links become <w:hyperlink> with a relationship each. */
const runsXml = (text: string, links: string[]): string =>
  inlineSegments(text)
    .map((segment) => {
      if (!segment.link) return runXml(segment);
      const index =
        links.indexOf(segment.link) >= 0 ? links.indexOf(segment.link) : links.push(segment.link) - 1;
      return `<w:hyperlink r:id="${hyperlinkId(index)}" w:history="1">${runXml(segment)}</w:hyperlink>`;
    })
    .join("");

const paragraph = (properties: string, runs: string): string =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs}</w:p>`;

// --- Blocks --------------------------------------------------------------------------------------

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "item"; ordered: boolean; level: number; text: string; list: number }
  | { type: "table"; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "code"; lines: string[] }
  | { type: "rule" };

// A closing run of "#" counts only after a space (CommonMark 4.2): "## Using C#" keeps its "#".
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** "| a | b |" → ["a", "b"]; escaped pipes stay in their cell. */
const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));

/** Markdown's blocks, line by line. Lists are numbered by `list`, so each numbered list starts at 1. */
export const markdownBlocks = (markdown: string): Block[] => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let lists = 0;
  let inList = false;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    const item = ITEM.exec(line);
    if (!item) inList = inList && line.trim() === "" && ITEM.test(next);
    if (line.trim() === "") {
      index += 1;
    } else if (FENCE.test(line)) {
      const fence = FENCE.exec(line)?.[1] ?? "```";
      const end = lines.findIndex((candidate, at) => at > index && candidate.trim().startsWith(fence));
      const last = end < 0 ? lines.length : end;
      blocks.push({ type: "code", lines: lines.slice(index + 1, last) });
      index = last + 1;
    } else if (HEADING.test(line)) {
      const [, hashes = "#", text = ""] = HEADING.exec(line) ?? [];
      blocks.push({ type: "heading", level: hashes.length, text });
      index += 1;
    } else if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
    } else if (item) {
      const [, indent = "", marker = "-", text = ""] = item;
      if (!inList) lists += 1;
      inList = true;
      blocks.push({
        type: "item",
        ordered: /\d/.test(marker),
        level: Math.min(8, Math.floor(indent.replace(/\t/g, "    ").length / 2)),
        text,
        list: lists,
      });
      index += 1;
    } else if (line.includes("|") && TABLE_DIVIDER.test(next)) {
      const rows = [cellsOf(line)];
      index += 2;
      while (
        index < lines.length &&
        (lines[index] ?? "").includes("|") &&
        (lines[index] ?? "").trim() !== ""
      ) {
        rows.push(cellsOf(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", rows });
    } else if (line.trimStart().startsWith(">")) {
      const quoted: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trimStart().startsWith(">")) {
        quoted.push((lines[index] ?? "").trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quoted.join(" ") });
    } else {
      // A paragraph runs until an empty line or the start of another block.
      const text: string[] = [line.trim()];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const following = lines[index + 1] ?? "";
        if (
          candidate.trim() === "" ||
          HEADING.test(candidate) ||
          ITEM.test(candidate) ||
          FENCE.test(candidate) ||
          RULE.test(candidate) ||
          candidate.trimStart().startsWith(">") ||
          (candidate.includes("|") && TABLE_DIVIDER.test(following))
        )
          break;
        text.push(candidate.trim());
        index += 1;
      }
      blocks.push({ type: "paragraph", text: text.join(" ") });
    }
  }
  return blocks;
};

// --- Parts ---------------------------------------------------------------------------------------

/** The text width on A4 with the margins of docx.ts, in twips (as in templates.ts). */
const TEXT_WIDTH = 9072;
const BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"';

const tableXml = (rows: string[][], links: string[]): string => {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const column = Math.floor(TEXT_WIDTH / width);
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} ${BORDER}/>`)
    .join("");
  const rowXml = (row: string[], header: boolean) =>
    `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: width }, (_, index) => {
      const text = row[index] ?? "";
      return `<w:tc><w:tcPr><w:tcW w:w="${column}" w:type="dxa"/></w:tcPr>${paragraph(
        '<w:spacing w:before="0" w:after="0"/>',
        runsXml(header && text ? `**${text.replace(/\*\*/g, "")}**` : text, links),
      )}</w:tc>`;
    }).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${column * width}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from(
    { length: width },
    () => `<w:gridCol w:w="${column}"/>`,
  ).join("")}</w:tblGrid>${rows.map((row, index) => rowXml(row, index === 0)).join("")}</w:tbl>`;
};

/** Numbering ids: 1 is every bullet list; each numbered list has one of its own from 2, to start at 1. */
const BULLETS = ["•", "◦", "▪"];
const levels = (format: "bullet" | "decimal") =>
  Array.from({ length: 9 }, (_, level) => {
    const text = format === "bullet" ? (BULLETS[level % 3] ?? "•") : `%${level + 1}.`;
    const font =
      format === "bullet"
        ? '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:hint="default"/></w:rPr>'
        : "";
    return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr>${font}</w:lvl>`;
  }).join("");

const numberingXml = (numbered: number[]): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels("bullet")}</w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels("decimal")}</w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
${numbered
  .map(
    (numId) =>
      `  <w:num w:numId="${numId}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
  )
  .join("\n")}
</w:numbering>`;

const HEADING_POINTS = [16, 13, 12, 11, 11, 11];

/**
 * Word's own heading styles (named "heading n", so Word and the engine show them in the reader's
 * language), a quote, code, list paragraphs and the hyperlink character style.
 */
const stylesXml = (): string =>
  [
    ...HEADING_POINTS.map(
      (points, index) =>
        `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Standard"/><w:next w:val="Standard"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${index === 0 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${index}"/></w:pPr><w:rPr><w:b/><w:bCs/>${index >= 3 ? "<w:i/>" : ""}<w:sz w:val="${points * 2}"/><w:szCs w:val="${points * 2}"/></w:rPr></w:style>`,
    ),
    '<w:style w:type="paragraph" w:styleId="Listenabsatz"><w:name w:val="List Paragraph"/><w:basedOn w:val="Standard"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Zitat"><w:name w:val="Quote"/><w:basedOn w:val="Standard"/><w:qFormat/><w:pPr><w:ind w:left="567" w:right="567"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="404040"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Standard"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>',
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>',
  ].join("");

/** A .docx from Markdown; an empty text gives one empty paragraph, like a new document. */
export const markdownDocx = (markdown: string): Uint8Array => {
  const blocks = markdownBlocks(markdown);
  const links: string[] = [];
  const numbered = new Map<number, number>();
  const numIdOf = (block: Extract<Block, { type: "item" }>) => {
    if (!block.ordered) return 1;
    if (!numbered.has(block.list)) numbered.set(block.list, numbered.size + 2);
    return numbered.get(block.list) ?? 2;
  };
  const body = blocks.map((block) => {
    switch (block.type) {
      case "heading":
        return paragraph(`<w:pStyle w:val="Heading${block.level}"/>`, runsXml(block.text, links));
      case "paragraph":
        return paragraph("", runsXml(block.text, links));
      case "item":
        return paragraph(
          `<w:pStyle w:val="Listenabsatz"/><w:numPr><w:ilvl w:val="${block.level}"/><w:numId w:val="${numIdOf(block)}"/></w:numPr>`,
          runsXml(block.text, links),
        );
      case "quote":
        return paragraph('<w:pStyle w:val="Zitat"/>', runsXml(block.text, links));
      case "code":
        return block.lines
          .map((line) => paragraph('<w:pStyle w:val="Code"/>', runXml({ text: line })))
          .join("");
      case "table":
        // Word wants a paragraph after a table; an empty one keeps the next table apart.
        return `${tableXml(block.rows, links)}${paragraph('<w:spacing w:after="0"/>', "")}`;
      default:
        return paragraph(
          '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>',
          "",
        );
    }
  });
  const hasLists = blocks.some((block) => block.type === "item");
  return docx(body.length > 0 ? body : [paragraph("", "")], {
    styles: stylesXml(),
    ...(hasLists ? { numbering: numberingXml([...numbered.values()]) } : {}),
    hyperlinks: links,
  });
};

/** A paragraph as the editor inserts it (files-api agentBlockSchema), from Markdown. */
export type MarkdownParagraph = {
  kind: "heading" | "paragraph" | "bullet" | "number";
  level: number;
  runs: { text: string; bold?: boolean; italic?: boolean }[];
};

const plainRuns = (text: string): MarkdownParagraph["runs"] =>
  inlineSegments(text).map(({ text: part, bold, italic }) => ({
    text: part,
    ...(bold ? { bold } : {}),
    ...(italic ? { italic } : {}),
  }));

/**
 * Markdown as paragraphs for inserting into an open document: headings, paragraphs and list items
 * keep what they are; a table becomes a line per row with its cells apart by tabs, a quote and code
 * plain paragraphs, a rule nothing. Links keep their text.
 */
export const markdownParagraphs = (markdown: string): MarkdownParagraph[] =>
  markdownBlocks(markdown).flatMap((block): MarkdownParagraph[] => {
    switch (block.type) {
      case "heading":
        return [{ kind: "heading", level: block.level, runs: plainRuns(block.text) }];
      case "item":
        return [
          { kind: block.ordered ? "number" : "bullet", level: block.level, runs: plainRuns(block.text) },
        ];
      case "table":
        return block.rows.map((row) => ({ kind: "paragraph", level: 0, runs: plainRuns(row.join("\t")) }));
      case "code":
        return block.lines.map((line) => ({ kind: "paragraph", level: 0, runs: [{ text: line }] }));
      case "paragraph":
      case "quote":
        return [{ kind: "paragraph", level: 0, runs: plainRuns(block.text) }];
      default:
        return [];
    }
  });
