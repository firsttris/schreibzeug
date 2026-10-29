import {
  type LayoutCommands,
  LINE_SPACINGS,
  MARGIN_PRESETS,
  type MarginPreset,
  marginPresetOf,
  PAPER_SIZES,
  type PageLayout,
  paperSizeOf,
} from "@schreibzeug/editor-core";
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

const MARGIN_LABELS: Record<MarginPreset["id"], () => string> = {
  normal: m.layout_menus_margins_normal,
  narrow: m.layout_menus_margins_narrow,
  moderate: m.layout_menus_margins_moderate,
  wide: m.layout_menus_margins_wide,
};

/** 1.15 → "1,15" in German, "1.15" in English: the decimals of the interface language. */
export const formatSpacing = (multiple: number): string =>
  multiple.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/**
 * "Layout": orientation, paper size and margins of the section at the cursor, as web-apps' layout
 * tab offers them (documenteditor main view/Toolbar.js). A check mark shows what the page has.
 */
export const layoutMenu = (page: PageLayout | null, layout: LayoutCommands | null, off: boolean): Menu => {
  const disabled = off || !layout || !page;
  const size = page && paperSizeOf(page);
  const margins = page && marginPresetOf(page.margins);
  return {
    label: m.layout_menus_layout(),
    groups: [
      [
        {
          label: m.layout_menus_portrait(),
          checked: page?.portrait === true,
          disabled,
          onSelect: () => layout?.setOrientation(true),
        },
        {
          label: m.layout_menus_landscape(),
          checked: page?.portrait === false,
          disabled,
          onSelect: () => layout?.setOrientation(false),
        },
      ],
      PAPER_SIZES.map((paper) => ({
        label: paper.id,
        checked: size?.id === paper.id,
        disabled,
        onSelect: () => layout?.setPaperSize(paper),
      })),
      MARGIN_PRESETS.map((preset) => ({
        label: MARGIN_LABELS[preset.id](),
        checked: margins === preset.id,
        disabled,
        onSelect: () => layout?.setMargins(preset.margins),
      })),
    ],
  };
};

/** One entry per line spacing; the label says what it is where the context does not. */
export const lineSpacingItems = (
  lineSpacing: number | null,
  layout: LayoutCommands | null,
  disabled: boolean,
  label: (multiple: number) => string = (multiple) =>
    m.layout_menus_line_spacing({ spacing: formatSpacing(multiple) }),
): MenuItem[] =>
  LINE_SPACINGS.map((multiple) => ({
    label: label(multiple),
    checked: lineSpacing === multiple,
    disabled,
    onSelect: () => layout?.setLineSpacing(multiple),
  }));

/** Line spacing and indents, for the "Format" menu. */
export const paragraphSpacingGroups = (
  lineSpacing: number | null,
  layout: LayoutCommands | null,
  off: boolean,
): MenuItem[][] => {
  const disabled = off || !layout;
  return [
    lineSpacingItems(lineSpacing, layout, disabled),
    [
      { label: m.layout_menus_indent_more(), disabled, onSelect: () => layout?.indent("more") },
      { label: m.layout_menus_indent_less(), disabled, onSelect: () => layout?.indent("less") },
    ],
  ];
};
