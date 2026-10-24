/**
 * Headers, footers and page numbers of a text document, as web-apps offers them
 * (documenteditor main controller/HeaderFooterTab.js onHeaderFooterEditRemove,
 * controller/Toolbar.js onInsertPageNumberClick, onInsertPageCountClick).
 */

/** Where a page number goes: in the header or the footer, and where on the line. */
export type PageNumberPlace = { in: "header" | "footer"; align: "left" | "center" | "right" };

/**
 * documenteditor main controller/DocumentHolder.js `c_pageNumPosition`: put_PageNum takes the part
 * (top 1, bottom 2) and the alignment (right 0, left 1, center 2); -1 puts the number at the cursor.
 */
const PART = { header: 0x01, footer: 0x02 } as const;
const ALIGN = { right: 0, left: 1, center: 2 } as const;
const AT_CURSOR = -1;

/** word/api.js, the calls behind these commands. */
export type HeaderFooterApi = {
  /** The page the cursor is on (m_oDrawingDocument.m_lCurrentPage). */
  getCurrentPage(): number;
  GoToHeader(page: number): void;
  GoToFooter(page: number): void;
  asc_RemoveHeader(page: number): void;
  asc_RemoveFooter(page: number): void;
  /** Leaves the header or footer and goes back into the body (CDocument.EndHdrFtrEditing). */
  asc_CancelHdrFtrEditing(): void;
  put_PageNum(where: number, align?: number): void;
  /** A field with the number of pages, at the cursor. */
  asc_AddPageCount(): void;
};

export type HeaderFooterCommands = {
  /** Puts the cursor into the header or footer of the current page, making one if there is none. */
  edit: (part: "header" | "footer") => void;
  remove: (part: "header" | "footer") => void;
  close: () => void;
  /** A page number in the header or footer, or at the cursor without a place. */
  insertPageNumber: (place?: PageNumberPlace) => void;
  insertPageCount: () => void;
};

/**
 * `focus` hands the keys back to the engine: the commands are chosen from a menu outside the frame,
 * and the next thing the person does is type into the header or the page.
 */
export const createHeaderFooterCommands = (
  api: HeaderFooterApi,
  focus: () => void,
): HeaderFooterCommands => ({
  edit: (part) => {
    if (part === "header") api.GoToHeader(api.getCurrentPage());
    else api.GoToFooter(api.getCurrentPage());
    focus();
  },
  remove: (part) =>
    part === "header"
      ? api.asc_RemoveHeader(api.getCurrentPage())
      : api.asc_RemoveFooter(api.getCurrentPage()),
  close: () => {
    api.asc_CancelHdrFtrEditing();
    focus();
  },
  insertPageNumber: (place) =>
    place ? api.put_PageNum(PART[place.in], ALIGN[place.align]) : api.put_PageNum(AT_CURSOR),
  insertPageCount: () => api.asc_AddPageCount(),
});
