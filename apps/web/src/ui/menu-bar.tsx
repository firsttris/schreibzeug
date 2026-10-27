import { useEffect, useRef, useState } from "react";
import { type MenuItem, MenuList } from "./menu";
import { popoverPanel } from "./use-popover";

export type Menu = { label: string; groups: MenuItem[][] };

/**
 * A row of menus as in a desktop office suite: a click opens one, moving to a neighbour while one is
 * open switches to it, and a click elsewhere, Escape or a click into the document (the window loses
 * focus to the engine's frame) closes it.
 */
export const MenuBar = ({ label, menus }: { label: string; menus: Menu[] }) => {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const close = () => setOpen(null);
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  return (
    <div ref={ref} role="menubar" aria-label={label} className="flex flex-wrap items-center">
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === menu.label}
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            onPointerEnter={() => open !== null && setOpen(menu.label)}
            className="h-7 rounded-md px-2 text-sm hover:bg-[var(--muted)] aria-expanded:bg-[var(--muted)]"
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <div className={`${popoverPanel} top-8 z-20`}>
              <MenuList label={menu.label} groups={menu.groups} onDone={() => setOpen(null)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
