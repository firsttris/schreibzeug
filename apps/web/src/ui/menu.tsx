import { Check } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button, type ButtonProps } from "./button";
import { moveFocus } from "./menu-keys";
import { popoverPanel, usePopover } from "./use-popover";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  icon?: ReactNode;
  /** The keys that do the same, shown on the right ("Strg+B"). */
  shortcut?: string;
  disabled?: boolean;
  /** A setting that is on: a check mark in front. */
  checked?: boolean;
};

const itemClass = (danger: boolean | undefined) =>
  `flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)] disabled:pointer-events-none disabled:opacity-40 ${danger ? "text-red-600 dark:text-red-400" : ""}`;

/** One entry: an action, or a setting with a check mark when `checked` is given. */
const Item = ({ item, marks, onDone }: { item: MenuItem; marks: boolean; onDone: () => void }) => {
  const { label, onSelect, danger, icon, shortcut, disabled, checked } = item;
  const select = () => {
    onSelect();
    onDone();
  };
  const content = (
    <>
      {marks && (
        <span aria-hidden className="flex w-4 shrink-0 justify-center">
          {checked ? <Check size={14} /> : icon}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="pl-6 text-xs text-[var(--muted-foreground)]">{shortcut}</span>}
    </>
  );
  return checked === undefined ? (
    <button type="button" role="menuitem" disabled={disabled} onClick={select} className={itemClass(danger)}>
      {content}
    </button>
  ) : (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={select}
      className={itemClass(danger)}
    >
      {content}
    </button>
  );
};

const entriesOf = (menu: HTMLElement) =>
  [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(
    (entry) => !(entry as HTMLButtonElement).disabled,
  );

/**
 * Menu entries in groups, with a line between groups; the arrow keys go from entry to entry.
 * `focusFirst` puts the focus on the first entry, for a menu opened with the keyboard.
 */
export const MenuList = ({
  label,
  groups,
  onDone,
  focusFirst = false,
}: {
  label: string;
  groups: MenuItem[][];
  onDone: () => void;
  focusFirst?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusFirst && ref.current) entriesOf(ref.current)[0]?.focus();
  }, [focusFirst]);
  const marks = groups.some((group) => group.some((item) => item.checked !== undefined || item.icon));
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="flex min-w-52 flex-col"
      onKeyDown={(event) => {
        if (ref.current && moveFocus(event.key, entriesOf(ref.current), "vertical")) event.preventDefault();
      }}
    >
      {groups
        .filter((group) => group.length > 0)
        .map((group, index) => (
          <div
            key={group[0]?.label ?? index}
            className={`flex flex-col ${index > 0 ? "mt-1 border-t border-[var(--border)] pt-1" : ""}`}
          >
            {group.map((item) => (
              <Item key={item.label} item={item} marks={marks} onDone={onDone} />
            ))}
          </div>
        ))}
    </div>
  );
};

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
