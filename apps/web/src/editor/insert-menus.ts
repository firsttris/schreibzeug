import type { InsertCommands } from "@schreibzeug/editor-core";
import type { MenuItem } from "../ui/menu";

export const NO_TABLE_OF_CONTENTS = "Das Dokument hat kein Inhaltsverzeichnis. Fügen Sie zuerst eins ein.";

/**
 * Breaks, then the table of contents and notes, for "Einfügen", as web-apps' toolbar and
 * "Verweise" tab offer them (documenteditor main view/Toolbar.js btnInsPageBreak, view/Links.js
 * btnsContents, btnsNotes). The page break comes from the text commands, with its shortcut.
 */
export const insertGroups = (
  insert: InsertCommands | null,
  pageBreak: () => void,
  off: boolean,
  onNotice: (message: string) => void,
): MenuItem[][] => {
  const disabled = off || !insert;
  return [
    [
      { label: "Seitenumbruch", shortcut: "Strg+Enter", disabled: off, onSelect: pageBreak },
      { label: "Spaltenumbruch", disabled, onSelect: () => insert?.columnBreak() },
      {
        label: "Abschnittsumbruch (nächste Seite)",
        disabled,
        onSelect: () => insert?.sectionBreak("nextPage"),
      },
      {
        label: "Abschnittsumbruch (fortlaufend)",
        disabled,
        onSelect: () => insert?.sectionBreak("continuous"),
      },
    ],
    [
      { label: "Inhaltsverzeichnis", disabled, onSelect: () => insert?.tableOfContents() },
      {
        label: "Inhaltsverzeichnis aktualisieren",
        disabled,
        onSelect: () => {
          if (insert && !insert.updateTableOfContents()) onNotice(NO_TABLE_OF_CONTENTS);
        },
      },
      { label: "Fußnote", shortcut: "Strg+Alt+F", disabled, onSelect: () => insert?.footnote() },
      { label: "Endnote", disabled, onSelect: () => insert?.endnote() },
    ],
  ];
};
