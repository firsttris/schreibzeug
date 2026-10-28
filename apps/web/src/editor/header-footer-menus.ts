import type { HeaderFooterCommands, PageNumberPlace } from "@schreibzeug/editor-core";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";

/** The usual places; web-apps' picker has all six, the menu keeps the ones letters use. */
const PAGE_NUMBERS: Array<{ label: () => string; place: PageNumberPlace }> = [
  { label: m.header_footer_menus_page_number_bottom_center, place: { in: "footer", align: "center" } },
  { label: m.header_footer_menus_page_number_bottom_right, place: { in: "footer", align: "right" } },
  { label: m.header_footer_menus_page_number_top_right, place: { in: "header", align: "right" } },
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
        { label: m.header_footer_menus_close(), disabled, onSelect: () => headerFooter?.close() },
        {
          label: m.header_footer_menus_remove_header(),
          danger: true,
          disabled,
          onSelect: () => headerFooter?.remove("header"),
        },
        {
          label: m.header_footer_menus_remove_footer(),
          danger: true,
          disabled,
          onSelect: () => headerFooter?.remove("footer"),
        },
      ]
    : [
        {
          label: m.header_footer_menus_edit_header(),
          disabled,
          onSelect: () => headerFooter?.edit("header"),
        },
        {
          label: m.header_footer_menus_edit_footer(),
          disabled,
          onSelect: () => headerFooter?.edit("footer"),
        },
      ];
  return [
    editing,
    [
      ...PAGE_NUMBERS.map(({ label, place }) => ({
        label: label(),
        disabled,
        onSelect: () => headerFooter?.insertPageNumber(place),
      })),
      {
        label: m.header_footer_menus_page_number_at_cursor(),
        disabled,
        onSelect: () => headerFooter?.insertPageNumber(),
      },
      {
        label: m.header_footer_menus_page_count(),
        disabled,
        onSelect: () => headerFooter?.insertPageCount(),
      },
    ],
  ];
};
