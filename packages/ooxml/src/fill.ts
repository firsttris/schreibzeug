import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { escapeXml } from "./zip";

/*
 * Fills a template's placeholders: "[Nr.]", "[Datum]" and the like, as the built-in templates
 * (templates.ts) mark what to fill in. Replaced in the XML of the document, sheet or slide parts,
 * where text is text content (w:t, t, a:t), so a value lands escaped and keeps the run's look. A
 * placeholder Word has split across runs (spell check, an edit inside it) is not found; the answer
 * says which ones were not.
 */

const TEXT_PARTS =
  /^(word\/(document|header\d*|footer\d*)|xl\/(sharedStrings|worksheets\/sheet\d+)|ppt\/slides\/slide\d+)\.xml$/;
const PLACEHOLDER = /\[[^\][<>]{1,60}\]/g;

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
    for (const [placeholder] of strFromU8(data).matchAll(PLACEHOLDER)) found.add(placeholder.slice(1, -1));
  }
  return [...found];
};

/** The file with every "[key]" replaced by its value; keys are given without brackets. */
export const fillPlaceholders = (bytes: Uint8Array, values: Record<string, string>): Filled => {
  const files = unzipSync(bytes);
  const used = new Set<string>();
  for (const [path, data] of Object.entries(files)) {
    if (!TEXT_PARTS.test(path)) continue;
    let xml = strFromU8(data);
    for (const [key, value] of Object.entries(values)) {
      const placeholder = escapeXml(`[${key}]`);
      if (!xml.includes(placeholder)) continue;
      used.add(key);
      xml = xml.split(placeholder).join(escapeXml(value));
    }
    files[path] = strToU8(xml);
  }
  const filled = zipSync(files);
  return {
    bytes: filled,
    missing: Object.keys(values).filter((key) => !used.has(key)),
    left: placeholdersOf(filled),
  };
};
