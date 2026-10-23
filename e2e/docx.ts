import { strFromU8, unzipSync } from "fflate";

/** The main document part of a .docx. */
export const documentXml = (docx: Uint8Array): string => {
  const part = unzipSync(docx, { filter: (file) => file.name === "word/document.xml" })["word/document.xml"];
  if (!part) throw new Error("word/document.xml is missing");
  return strFromU8(part);
};

/** The text of every paragraph, with runs joined, so split runs still compare as one text. */
export const paragraphTexts = (xml: string): string[] =>
  [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map(([paragraph]) =>
      [...paragraph.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text).join(""),
    )
    .filter((text) => text.length > 0);

/** The run properties of the runs that carry the given text. */
export const runPropertiesOf = (xml: string, text: string): string[] =>
  [...xml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)]
    .map(([run]) => run)
    .filter((run) => run.includes(text))
    .map((run) => run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "");
