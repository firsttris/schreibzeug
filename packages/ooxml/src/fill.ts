import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { escapeXml } from "./zip";

/*
 * Fills a template's placeholders: "[Nr.]", "[Datum]" and the like, as the built-in templates
 * (templates.ts) mark what to fill in. Replaced in the XML of the document, sheet or slide parts,
 * where text is text content (w:t, t, a:t), so a value lands escaped and keeps the run's look. A
 * placeholder Word has split across runs (spell check, an edit inside it) is not found; the answer
 * says which ones were not.
 */

/** The text of XML text content; placeholders are named as a person reads them. */
const unescapeXml = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const TEXT_PARTS =
  /^(word\/(document|header\d*|footer\d*)|xl\/(sharedStrings|worksheets\/sheet\d+)|ppt\/slides\/slide\d+)\.xml$/;
const PLACEHOLDER = /\[[^\][<>]{1,60}\]/g;

/**
 * A cell's formula (SpreadsheetML <f>, ECMA-376 Part 1, 18.3.1.40), empty or not. Its brackets are
 * structured references, "=SUM(Tabelle1[Betrag])", not placeholders, so formulas stay as they are.
 */
const FORMULA = /(<f(?:\s[^>]*)?\/>|<f(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/f>)/;

/** A part's XML in pieces: what may hold placeholders at even places, the formulas between. */
const piecesOf = (xml: string): string[] => xml.split(FORMULA);
const isFormula = (index: number) => index % 2 === 1;

export type Filled = {
  bytes: Uint8Array;
  /** The keys given that the file does not contain. */
  missing: string[];
  /** The placeholders still in the file afterwards, without their brackets. */
  left: string[];
};

/** The placeholders of an Office file, each once, in the order they first appear. */
export const placeholdersOf = (bytes: Uint8Array): string[] => {
  const found = new Set<string>();
  for (const [path, data] of Object.entries(unzipSync(bytes))) {
    if (!TEXT_PARTS.test(path)) continue;
    for (const [index, piece] of piecesOf(strFromU8(data)).entries()) {
      if (isFormula(index)) continue;
      for (const [placeholder] of piece.matchAll(PLACEHOLDER))
        found.add(unescapeXml(placeholder.slice(1, -1)));
    }
  }
  return [...found];
};

/** The file with every "[key]" replaced by its value; keys are given without brackets. */
export const fillPlaceholders = (bytes: Uint8Array, values: Record<string, string>): Filled => {
  const files = unzipSync(bytes);
  const used = new Set<string>();
  for (const [path, data] of Object.entries(files)) {
    if (!TEXT_PARTS.test(path)) continue;
    let pieces = piecesOf(strFromU8(data));
    for (const [key, value] of Object.entries(values)) {
      const placeholder = escapeXml(`[${key}]`);
      if (!pieces.some((piece, index) => !isFormula(index) && piece.includes(placeholder))) continue;
      used.add(key);
      pieces = pieces.map((piece, index) =>
        isFormula(index) ? piece : piece.split(placeholder).join(escapeXml(value)),
      );
    }
    files[path] = strToU8(pieces.join(""));
  }
  const filled = zipSync(files);
  return {
    bytes: filled,
    missing: Object.keys(values).filter((key) => !used.has(key)),
    left: placeholdersOf(filled),
  };
};
