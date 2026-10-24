import {
  type LayoutCommands,
  LINE_SPACINGS,
  MARGIN_PRESETS,
  type MarginPreset,
  marginPresetOf,
  PAPER_SIZES,
  type PageLayout,
  paperSizeOf,
} from "@stapel/editor-core";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

const MARGIN_LABELS: Record<MarginPreset["id"], string> = {
  normal: "Ränder normal",
  narrow: "Ränder schmal",
  moderate: "Ränder mittel",
  wide: "Ränder breit",
};

/** 1.15 → "1,15": German decimals, as the rest of the interface writes them. */
export const formatSpacing = (multiple: number): string =>
  multiple.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/**
 * "Layout": orientation, paper size and margins of the section at the cursor, as web-apps' layout
 * tab offers them (documenteditor main view/Toolbar.js). A check mark shows what the page has.
 */
export const layoutMenu = (page: PageLayout | null, layout: LayoutCommands | null, off: boolean): Menu => {
  const disabled = off || !layout || !page;
  const size = page && paperSizeOf(page);
  const margins = page && marginPresetOf(page.margins);
  return {
    label: "Layout",
    groups: [
      [
        {
          label: "Hochformat",
          checked: page?.portrait === true,
          disabled,
          onSelect: () => layout?.setOrientation(true),
        },
        {
          label: "Querformat",
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
        label: MARGIN_LABELS[preset.id],
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
  label: (multiple: number) => string = (multiple) => `Zeilenabstand ${formatSpacing(multiple)}`,
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
      { label: "Einzug vergrößern", disabled, onSelect: () => layout?.indent("more") },
      { label: "Einzug verkleinern", disabled, onSelect: () => layout?.indent("less") },
    ],
  ];
};
