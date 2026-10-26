import { strFromU8, strToU8, zipSync } from "fflate";
import { boundedUnzip } from "./unzip";
import { escapeXml } from "./zip";

/*
 * Merge fields as Word writes them are complex fields (ECMA-376 Part 1, 17.16.18): runs with
 * <w:fldChar w:fldCharType="begin"/>, the instruction " MERGEFIELD Name \* MERGEFORMAT " in
 * <w:instrText>, "separate", the shown result, "end". The engine merges only simple fields
 * (<w:fldSimple w:instr="MERGEFIELD Name">, 17.16.19), which it reads into its ParaField and writes
 * itself (word/Editor/Document.js Register_Field → m_oMailMergeFields); a complex MERGEFIELD stays
 * «Name» in every letter. So a document's complex merge fields become simple ones with the same
 * instruction and result before it opens; Word reads both alike.
 */

const RUN = String.raw`<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?`;
const fieldChar = (type: string) => String.raw`<w:fldChar\b[^>]*w:fldCharType="${type}"[^>]*\/>`;
const COMPLEX_FIELD = new RegExp(
  String.raw`${RUN}${fieldChar("begin")}(?:(?!<\/w:r>)[\s\S])*?<\/w:r>([\s\S]*?)${RUN}${fieldChar("end")}(?:(?!<\/w:r>)[\s\S])*?<\/w:r>`,
  "g",
);
const SEPARATE_RUN = new RegExp(String.raw`${RUN}${fieldChar("separate")}(?:(?!<\/w:r>)[\s\S])*?<\/w:r>`);

/** The complex MERGEFIELDs of one part as simple fields; anything else (nested, across paragraphs) stays. */
export const simplifyMergeFieldsIn = (xml: string): string =>
  xml.replace(COMPLEX_FIELD, (whole, inner: string) => {
    if (/<\/w:p>|w:fldCharType="begin"/.test(inner)) return whole;
    const separate = SEPARATE_RUN.exec(inner);
    const instructionPart = separate ? inner.slice(0, separate.index) : inner;
    const result = separate ? inner.slice(separate.index + separate[0].length) : "";
    const instruction = [...instructionPart.matchAll(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g)]
      .map((match) => match[1] ?? "")
      .join("");
    if (!/^\s*MERGEFIELD\s/i.test(instruction)) return whole;
    const instr = instruction
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return `<w:fldSimple w:instr="${escapeXml(instr)}">${result}</w:fldSimple>`;
  });

const PARTS = /^word\/(?:document|header\d*|footer\d*)\.xml$/;

/** The .docx with its complex merge fields made simple; the same bytes when it has none. */
export const simplifyMergeFields = (docx: Uint8Array): Uint8Array => {
  let files: Record<string, Uint8Array>;
  try {
    files = boundedUnzip(docx);
  } catch {
    return docx;
  }
  let changed = false;
  for (const [path, bytes] of Object.entries(files)) {
    if (!PARTS.test(path)) continue;
    const xml = strFromU8(bytes);
    if (!xml.includes("MERGEFIELD")) continue;
    const simplified = simplifyMergeFieldsIn(xml);
    if (simplified !== xml) {
      files[path] = strToU8(simplified);
      changed = true;
    }
  }
  return changed ? zipSync(files) : docx;
};
