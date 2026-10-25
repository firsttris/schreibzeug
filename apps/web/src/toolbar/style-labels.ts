/**
 * The engine names paragraph styles in English, as they are stored in the .docx (`w:name`). Word
 * shows the built-in ones in the language of its interface; so does Schreibzeug. Styles a document
 * brings with its own name keep that name.
 */
const GERMAN: ReadonlyMap<string, string> = new Map(
  Object.entries({
    Normal: "Standard",
    "No Spacing": "Kein Leerraum",
    Title: "Titel",
    Subtitle: "Untertitel",
    Quote: "Zitat",
    "Intense Quote": "Intensives Zitat",
    "List Paragraph": "Listenabsatz",
    Caption: "Beschriftung",
    "Footnote Text": "Fußnotentext",
    "Endnote Text": "Endnotentext",
    Header: "Kopfzeile",
    Footer: "Fußzeile",
  }),
);

/** "Heading 3" → "Überschrift 3"; other built-in names from the table; anything else as it is. */
export const styleLabel = (name: string): string => {
  const heading = /^heading (\d)$/i.exec(name);
  if (heading) return `Überschrift ${heading[1]}`;
  // A Map, not an object lookup: a style named "constructor" must not find Object.prototype's.
  return GERMAN.get(name) ?? name;
};
