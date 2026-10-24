import type { HeaderFooterCommands, PageNumberPlace } from "@stapel/editor-core";
import type { MenuItem } from "../ui/menu";

/** The usual places; web-apps' picker has all six, the menu keeps the ones letters use. */
const PAGE_NUMBERS: Array<{ label: string; place: PageNumberPlace }> = [
  { label: "Seitenzahl unten mittig", place: { in: "footer", align: "center" } },
  { label: "Seitenzahl unten rechts", place: { in: "footer", align: "right" } },
  { label: "Seitenzahl oben rechts", place: { in: "header", align: "right" } },
];

/**
 * Header, footer and page numbers for "Einfügen", as web-apps' header/footer button offers them
 * (documenteditor main view/Toolbar.js btnEditHeader). Inside a header or footer the entries to
 * leave or remove it come first.
 */
export const headerFooterGroups = (
  headerFooter: HeaderFooterCommands | null,
  inHeaderFooter: boolean,
  off: boolean,
): MenuItem[][] => {
  const disabled = off || !headerFooter;
  const editing: MenuItem[] = inHeaderFooter
    ? [
        { label: "Kopf- und Fußzeile schließen", disabled, onSelect: () => headerFooter?.close() },
        {
          label: "Kopfzeile entfernen",
          danger: true,
          disabled,
          onSelect: () => headerFooter?.remove("header"),
        },
        {
          label: "Fußzeile entfernen",
          danger: true,
          disabled,
          onSelect: () => headerFooter?.remove("footer"),
        },
      ]
    : [
        { label: "Kopfzeile bearbeiten", disabled, onSelect: () => headerFooter?.edit("header") },
        { label: "Fußzeile bearbeiten", disabled, onSelect: () => headerFooter?.edit("footer") },
      ];
  return [
    editing,
    [
      ...PAGE_NUMBERS.map(({ label, place }) => ({
        label,
        disabled,
        onSelect: () => headerFooter?.insertPageNumber(place),
      })),
      {
        label: "Seitenzahl an der Cursorposition",
        disabled,
        onSelect: () => headerFooter?.insertPageNumber(),
      },
      { label: "Seitenanzahl", disabled, onSelect: () => headerFooter?.insertPageCount() },
    ],
  ];
};
