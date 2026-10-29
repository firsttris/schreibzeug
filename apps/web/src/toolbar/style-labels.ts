import { m } from "../paraglide/messages";

/**
 * The engine names paragraph styles in English, as they are stored in the .docx (`w:name`). Word
 * shows the built-in ones in the language of its interface; so does Schreibzeug. The engine names
 * stay the keys, since the engine looks styles up by them. Styles a document brings with its own
 * name keep that name.
 */
const LABELS: ReadonlyMap<string, () => string> = new Map(
  Object.entries({
    Normal: m.style_labels_normal,
    "No Spacing": m.style_labels_no_spacing,
    Title: m.style_labels_title,
    Subtitle: m.style_labels_subtitle,
    Quote: m.style_labels_quote,
    "Intense Quote": m.style_labels_intense_quote,
    "List Paragraph": m.style_labels_list_paragraph,
    Caption: m.style_labels_caption,
    "Footnote Text": m.style_labels_footnote_text,
    "Endnote Text": m.style_labels_endnote_text,
    Header: m.style_labels_header,
    Footer: m.style_labels_footer,
  }),
);

/** "Heading 3" → "Überschrift 3" in German; other built-in names from the table; anything else as it is. */
export const styleLabel = (name: string): string => {
  const level = /^heading (\d)$/i.exec(name)?.[1];
  if (level) return m.style_labels_heading({ level });
  // A Map, not an object lookup: a style named "constructor" must not find Object.prototype's.
  return LABELS.get(name)?.() ?? name;
};
