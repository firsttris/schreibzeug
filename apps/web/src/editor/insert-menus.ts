import type { InsertCommands } from "@schreibzeug/editor-core";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";

export const NO_TABLE_OF_CONTENTS = m.insert_menus_no_toc();

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
      {
        label: m.insert_menus_page_break(),
        shortcut: keys("Ctrl+Enter"),
        disabled: off,
        onSelect: pageBreak,
      },
      { label: m.insert_menus_column_break(), disabled, onSelect: () => insert?.columnBreak() },
      {
        label: m.insert_menus_section_break_next_page(),
        disabled,
        onSelect: () => insert?.sectionBreak("nextPage"),
      },
      {
        label: m.insert_menus_section_break_continuous(),
        disabled,
        onSelect: () => insert?.sectionBreak("continuous"),
      },
    ],
    [
      { label: m.insert_menus_toc(), disabled, onSelect: () => insert?.tableOfContents() },
      {
        label: m.insert_menus_update_toc(),
        disabled,
        onSelect: () => {
          if (insert && !insert.updateTableOfContents()) onNotice(NO_TABLE_OF_CONTENTS);
        },
      },
      {
        label: m.insert_menus_footnote(),
        shortcut: keys("Ctrl+Alt+F"),
        disabled,
        onSelect: () => insert?.footnote(),
      },
      { label: m.insert_menus_endnote(), disabled, onSelect: () => insert?.endnote() },
    ],
  ];
};
