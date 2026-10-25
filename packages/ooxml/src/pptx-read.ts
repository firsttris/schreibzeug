import { strFromU8, unzipSync } from "fflate";

/*
 * The text of a presentation, slide by slide (ECMA-376 Part 1, 19): the order of the slides is
 * <p:sldIdLst> in presentation.xml, each <p:sldId r:id> pointing through presentation.xml.rels to a
 * slide part. Text is in <a:t> inside runs inside paragraphs <a:p> (DrawingML, 21.1.2), in shapes
 * and in table cells alike. A slide's notes are the body placeholder of the notes slide its
 * relationships name (19.3.1.26).
 */

/** One slide: its title (the title placeholder's text), its other paragraphs, its notes. */
export type SlideText = { title: string | undefined; paragraphs: string[]; notes: string[] };

const unescapeXml = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The paragraphs of a piece of DrawingML, each the text of its runs; <a:br/> is a line break. */
const paragraphsOf = (xml: string): string[] =>
  [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map((match) =>
      [...(match[1] ?? match[2] ?? "").matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)]
        .map((part) => (part[0].startsWith("<a:br") ? "\n" : unescapeXml(part[1] ?? "")))
        .join(""),
    )
    .filter((text) => text.trim() !== "");

/** The shapes of a slide with the placeholder type each one has (or undefined). */
const shapesOf = (xml: string): { type: string | undefined; xml: string }[] =>
  [...xml.matchAll(/<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g)].map(([shape]) => ({
    type: attribute(/<p:ph\b[^>]*>/.exec(shape)?.[0] ?? "", "type"),
    xml: shape,
  }));

const TITLES = new Set(["title", "ctrTitle"]);

/** Resolves a relationship target against the folder of the part that names it. */
const resolvePart = (from: string, target: string): string => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
};

const relationsOf = (
  files: Record<string, Uint8Array>,
  part: string,
): { id: string; type: string; target: string }[] => {
  const folder = part.split("/").slice(0, -1).join("/");
  const name = part.split("/").at(-1) ?? "";
  const rels = files[`${folder}/_rels/${name}.rels`];
  return [...(rels ? strFromU8(rels) : "").matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => ({
    id: attribute(tag, "Id") ?? "",
    type: attribute(tag, "Type") ?? "",
    target: resolvePart(part, attribute(tag, "Target") ?? ""),
  }));
};

/** The text of every slide, in the order of the presentation. */
export const pptxSlides = (pptx: Uint8Array): SlideText[] => {
  const files = unzipSync(pptx, { filter: (file) => file.name.startsWith("ppt/") });
  const presentation = files["ppt/presentation.xml"];
  if (!presentation) return [];
  const relations = relationsOf(files, "ppt/presentation.xml");
  const slideIds = [...strFromU8(presentation).matchAll(/<p:sldId\b[^>]*>/g)].map(([tag]) =>
    attribute(tag, "r:id"),
  );
  return slideIds.flatMap((relationId) => {
    const path = relations.find((relation) => relation.id === relationId)?.target;
    const bytes = path ? files[path] : undefined;
    if (!path || !bytes) return [];
    const shapes = shapesOf(strFromU8(bytes));
    const title = shapes.find((shape) => shape.type && TITLES.has(shape.type));
    const notesPath = relationsOf(files, path).find((relation) =>
      relation.type.endsWith("/notesSlide"),
    )?.target;
    const notesBytes = notesPath ? files[notesPath] : undefined;
    const notes = notesBytes
      ? shapesOf(strFromU8(notesBytes))
          .filter((shape) => shape.type === "body")
          .flatMap((shape) => paragraphsOf(shape.xml))
      : [];
    return [
      {
        title: title ? paragraphsOf(title.xml).join(" ") || undefined : undefined,
        paragraphs: shapes.filter((shape) => shape !== title).flatMap((shape) => paragraphsOf(shape.xml)),
        notes,
      },
    ];
  });
};
