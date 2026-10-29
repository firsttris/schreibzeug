import type { LayoutCommands } from "@schreibzeug/editor-core";
import { LineHeight } from "lucide-react";
import { formatSpacing, lineSpacingItems } from "../editor/layout-menus";
import { m } from "../paraglide/messages";
import { MenuButton } from "../ui/menu";

type ParagraphSpacingProps = {
  lineSpacing: number | null;
  layout: LayoutCommands | null;
  disabled: boolean;
};

/** Line spacing and indents in one menu, as web-apps' line spacing button next to its indents. */
export const ParagraphSpacing = ({ lineSpacing, layout, disabled }: ParagraphSpacingProps) => (
  <MenuButton
    variant="ghost"
    label={m.paragraph_spacing_label()}
    disabled={disabled}
    groups={[
      // Under the button the number says enough.
      lineSpacingItems(lineSpacing, layout, disabled, formatSpacing),
      [
        { label: m.paragraph_spacing_indent_more(), onSelect: () => layout?.indent("more") },
        { label: m.paragraph_spacing_indent_less(), onSelect: () => layout?.indent("less") },
      ],
    ]}
  >
    <LineHeight size={16} />
  </MenuButton>
);
