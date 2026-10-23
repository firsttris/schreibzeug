import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button";
import { popoverPanel, usePopover } from "./use-popover";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode };

/** Menu entries in groups, with a line between groups. */
export const MenuList = ({
  label,
  groups,
  onDone,
}: {
  label: string;
  groups: MenuItem[][];
  onDone: () => void;
}) => (
  <div role="menu" aria-label={label} className="flex min-w-52 flex-col">
    {groups.map((group, index) => (
      <div
        key={group[0]?.label ?? index}
        className={`flex flex-col ${index > 0 ? "mt-1 border-t border-[var(--border)] pt-1" : ""}`}
      >
        {group.map(({ label: itemLabel, onSelect, danger, icon }) => (
          <button
            key={itemLabel}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect();
              onDone();
            }}
            className={`flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)] ${danger ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {icon}
            {itemLabel}
          </button>
        ))}
      </div>
    ))}
  </div>
);

export type MenuButtonProps = Omit<ButtonProps, "onClick" | "children"> & {
  /** The accessible name of the button and of the menu. */
  label: string;
  /** What the button shows. */
  children: ReactNode;
  groups: MenuItem[][];
  /** Which edge the menu lines up with; "right" for buttons at the right end of a row. */
  align?: "left" | "right";
  /** Opens upwards, for buttons at the bottom of the window. */
  up?: boolean;
};

/** A button that opens a menu under it. */
export const MenuButton = ({
  label,
  children,
  groups,
  align = "left",
  up = false,
  ...button
}: MenuButtonProps) => {
  const { open, toggle, close, ref } = usePopover();
  const position = `${align === "right" ? "right-0 left-auto" : ""} ${up ? "top-auto bottom-9" : ""}`;
  return (
    <div ref={ref} className="relative">
      <Button aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} {...button}>
        {children}
      </Button>
      {open && (
        <div className={`${popoverPanel} ${position}`}>
          <MenuList label={label} groups={groups} onDone={close} />
        </div>
      )}
    </div>
  );
};
