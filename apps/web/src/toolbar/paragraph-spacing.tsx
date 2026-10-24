import type { LayoutCommands } from "@stapel/editor-core";
import { LineHeight } from "lucide-react";
import { formatSpacing, lineSpacingItems } from "../editor/layout-menus";
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
    label="Zeilenabstand und Einzug"
    disabled={disabled}
    groups={[
      // Under the button the number says enough.
      lineSpacingItems(lineSpacing, layout, disabled, formatSpacing),
      [
        { label: "Einzug vergrößern", onSelect: () => layout?.indent("more") },
        { label: "Einzug verkleinern", onSelect: () => layout?.indent("less") },
      ],
    ]}
  >
    <LineHeight size={16} />
  </MenuButton>
);
