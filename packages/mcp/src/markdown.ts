import type { DocxBlock } from "@schreibzeug/ooxml";

/** A table cell as Markdown: pipes escaped, line breaks as <br>. */
const cellText = (text: string): string => text.replace(/\|/g, "\\|").replace(/\n/g, "<br>").trim();

/** Rows as a Markdown table; the first row is the header. */
export const tableMarkdown = (rows: string[][]): string => {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cellText(row[index] ?? "")).join(" | ")} |`;
  const [header = [], ...body] = rows;
  return [line(header), `|${" --- |".repeat(width)}`, ...body.map(line)].join("\n");
};

/** A Word document's blocks as Markdown: headings, list items, paragraphs and tables. */
export const blocksMarkdown = (blocks: DocxBlock[]): string =>
  blocks
    // Empty paragraphs, headings and list items are spacing, not content.
    .filter((block) => block.type === "table" || block.text.trim() !== "")
    .map((block) => {
      if (block.type === "table") return tableMarkdown(block.rows);
      if (block.heading !== undefined) return `${"#".repeat(Math.min(block.heading, 6))} ${block.text}`;
      if (block.list !== undefined) return `${"  ".repeat(block.list)}- ${block.text}`;
      return block.text;
    })
    // A list stays together.
    .reduce((text, part, index, parts) => {
      if (index === 0) return part;
      const together = /^\s*- /.test(part) && /^\s*- /.test(parts[index - 1] ?? "");
      return `${text}${together ? "\n" : "\n\n"}${part}`;
    }, "");

/** How many characters a reading tool answers at most, so a document does not fill the conversation. */
export const PAGE_CHARACTERS = 20_000;

/**
 * A stretch of a long text, with a note on how to get the rest; the whole text when it is short.
 * Cut at a line break where there is one near the end, so a table row stays whole.
 */
export const pageOf = (text: string, offset = 0, limit = PAGE_CHARACTERS): string => {
  if (offset === 0 && text.length <= limit) return text;
  const start = Math.min(offset, text.length);
  let end = Math.min(start + limit, text.length);
  const lineBreak = text.lastIndexOf("\n", end);
  if (end < text.length && lineBreak > start + limit / 2) end = lineBreak + 1;
  const rest =
    end < text.length
      ? `\n\n[Zeichen ${start}–${end} von ${text.length}. Weiter mit offset=${end}.]`
      : `\n\n[Zeichen ${start}–${end} von ${text.length}, Ende.]`;
  return `${text.slice(start, end)}${rest}`;
};
