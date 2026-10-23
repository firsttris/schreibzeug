import { strFromU8, unzipSync } from "fflate";

/** One part of a .docx, as text. */
export const partXml = (docx: Uint8Array, name: string): string => {
  const part = unzipSync(docx, { filter: (file) => file.name === name })[name];
  if (!part) throw new Error(`${name} is missing`);
  return strFromU8(part);
};

/** The main document part of a .docx. */
export const documentXml = (docx: Uint8Array): string => partXml(docx, "word/document.xml");

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

/** The paragraph that carries the given text. */
export const paragraphWith = (xml: string, text: string): string => {
  const paragraph = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map(([p]) => p)
    .find((p) => p.includes(text));
  if (!paragraph) throw new Error(`No paragraph with "${text}"`);
  return paragraph;
};

/** The name (`w:name`) of the paragraph style of the paragraph with the given text, from styles.xml. */
export const styleNameOf = (docx: Uint8Array, text: string): string | null => {
  const styleId = paragraphWith(documentXml(docx), text).match(/<w:pStyle w:val="([^"]+)"/)?.[1];
  if (!styleId) return null;
  const style = partXml(docx, "word/styles.xml").match(
    new RegExp(`<w:style [^>]*w:styleId="${styleId}"[^>]*>[\\s\\S]*?<w:name w:val="([^"]+)"`),
  );
  return style?.[1] ?? null;
};
