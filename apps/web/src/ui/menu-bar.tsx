import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type MenuItem, MenuList } from "./menu";
import { popoverPanel } from "./use-popover";

export type Menu = { label: string; groups: MenuItem[][] };

/** Space kept between an open menu and the window's edge. */
const EDGE = 8;

/** How far a panel moves left so it ends inside the window (a menu far right on a phone). */
export const shiftIntoView = (left: number, width: number, windowWidth: number): number =>
  Math.min(0, Math.max(EDGE - left, windowWidth - EDGE - (left + width)));

/** A menu's panel under its button, moved left where it would run past the window's edge. */
const MenuPanel = ({ menu, onDone }: { menu: Menu; onDone: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const panel = ref.current?.getBoundingClientRect();
    // The page's own width: on a phone the window grows with a menu that sticks out.
    if (panel) setShift(shiftIntoView(panel.left, panel.width, document.documentElement.clientWidth));
  }, []);
  return (
    <div ref={ref} className={`${popoverPanel} top-8 z-20`} style={{ transform: `translateX(${shift}px)` }}>
      <MenuList label={menu.label} groups={menu.groups} onDone={onDone} />
    </div>
  );
};

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
          {open === menu.label && <MenuPanel menu={menu} onDone={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  );
};
