import type { LayoutCommands } from "@stapel/editor-core";
import { IndentDecrease, IndentIncrease, LineHeight } from "lucide-react";
import { formatSpacing, lineSpacingItems } from "../editor/layout-menus";
import { Button } from "../ui/button";
import { MenuButton } from "../ui/menu";

type ParagraphSpacingProps = {
  lineSpacing: number | null;
  layout: LayoutCommands | null;
  disabled: boolean;
};

/** Line spacing as a menu and the two indent buttons, as in web-apps' home tab. */
export const ParagraphSpacing = ({ lineSpacing, layout, disabled }: ParagraphSpacingProps) => {
  // Under the button the number says enough.
  const choices = lineSpacingItems(lineSpacing, layout, disabled, formatSpacing);
  return (
    <>
      <MenuButton variant="ghost" label="Zeilenabstand" groups={[choices]} disabled={disabled}>
        <LineHeight size={16} />
      </MenuButton>
      <Button
        variant="ghost"
        aria-label="Einzug verkleinern"
        disabled={disabled}
        onClick={() => layout?.indent("less")}
      >
        <IndentDecrease size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Einzug vergrößern"
        disabled={disabled}
        onClick={() => layout?.indent("more")}
      >
        <IndentIncrease size={16} />
      </Button>
    </>
  );
};
