/**
 * What "Einfügen" puts into a text document beyond text: a table of contents, footnotes and
 * endnotes, breaks and a text box, as web-apps' editors do it (documenteditor mobile
 * controller/add/AddTableContents.jsx onTableContents, controller/add/AddOther.jsx onPageBreak,
 * onColumnBreak, onInsertSectionBreak, onFootnote, controller/add/AddShape.jsx onShapeClick,
 * controller/ContextMenu.jsx onTableContentsUpdate; main controller/Links.js onNotesClick).
 */

/** word/apiCommon.js CTableOfContentsPr, the part set here. */
export type EngineTableOfContentsPr = {
  put_OutlineRange(from: number, to: number): void;
  put_Hyperlink(value: boolean): void;
  put_ShowPageNumbers(value: boolean): void;
  put_RightAlignTab(value: boolean): void;
  put_TabLeader(leader: number): void;
};

/** word/api.js, the calls behind these commands. */
export type InsertApi = {
  /** The table of contents of the document, or null where it has none (`isCurrent` false). */
  asc_GetTableOfContentsPr(isCurrent?: boolean): EngineTableOfContentsPr | null;
  /** Adds one, or with one there already, sets its properties (CDocument.AddTableOfContents). */
  asc_AddTableOfContents(heading: string | null, props: EngineTableOfContentsPr): void;
  /** Rebuilds the entries, or only their page numbers. */
  asc_UpdateTableOfContents(pagesOnly: boolean): void;
  asc_AddFootnote(text?: string): void;
  asc_AddEndnote(text?: string): void;
  put_AddColumnBreak(): void;
  add_SectionBreak(type: number): void;
  /** A shape of the preset in the middle of the page shown (DrawingObjects.addShapeOnPage). */
  AddShapeOnCurrentPage(preset: string): void;
};

/** common/commonDefines.js, the constants these commands need. */
export type InsertConstants = {
  c_oAscSectionBreakType: { NextPage: number; Continuous: number };
  c_oAscTabLeader: { Dot: number };
};

export type SectionBreak = "nextPage" | "continuous";

export type InsertCommands = {
  /** A table of contents of headings 1 to 9 at the cursor, with dotted leaders and page numbers. */
  tableOfContents: () => void;
  /** Rebuilds the table of contents from the headings; false where the document has none. */
  updateTableOfContents: () => boolean;
  footnote: () => void;
  endnote: () => void;
  columnBreak: () => void;
  sectionBreak: (type: SectionBreak) => void;
  /** A text box on the page shown, selected so it can be typed into and moved. */
  textBox: () => void;
};

/** Word's outline levels: every heading style a table of contents can list. */
const OUTLINE = { from: 1, to: 9 } as const;

/** The preset of a rectangle that holds text (common/Drawings/Format/Constants.js "textRect"). */
const TEXT_BOX = "textRect";

/**
 * `focus` hands the keys back to the engine after each command: they are chosen from a menu outside
 * the frame, and the next thing the person does is type into the note, the text box or the page.
 */
export const createInsertCommands = (
  api: InsertApi,
  Asc: InsertConstants,
  newTableOfContentsPr: () => EngineTableOfContentsPr,
  focus: () => void,
): InsertCommands => {
  const focused =
    <A extends unknown[], R>(command: (...args: A) => R) =>
    (...args: A): R => {
      const result = command(...args);
      focus();
      return result;
    };
  return {
    tableOfContents: focused(() => {
      const props = api.asc_GetTableOfContentsPr() ?? newTableOfContentsPr();
      props.put_OutlineRange(OUTLINE.from, OUTLINE.to);
      props.put_Hyperlink(true);
      props.put_ShowPageNumbers(true);
      props.put_RightAlignTab(true);
      props.put_TabLeader(Asc.c_oAscTabLeader.Dot);
      api.asc_AddTableOfContents(null, props);
    }),
    updateTableOfContents: focused(() => {
      if (!api.asc_GetTableOfContentsPr()) return false;
      api.asc_UpdateTableOfContents(false);
      return true;
    }),
    footnote: focused(() => api.asc_AddFootnote()),
    endnote: focused(() => api.asc_AddEndnote()),
    columnBreak: focused(() => api.put_AddColumnBreak()),
    sectionBreak: focused((type: SectionBreak) =>
      api.add_SectionBreak(
        type === "nextPage" ? Asc.c_oAscSectionBreakType.NextPage : Asc.c_oAscSectionBreakType.Continuous,
      ),
    ),
    textBox: focused(() => api.AddShapeOnCurrentPage(TEXT_BOX)),
  };
};
