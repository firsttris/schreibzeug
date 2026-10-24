import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type MenuItem, MenuList } from "./menu";

export type ContextMenuProps = {
  /** Where the click was, in the coordinates of the window. */
  x: number;
  y: number;
  label: string;
  groups: MenuItem[][];
  onClose: () => void;
};

/**
 * A menu at the point of a right click. It moves left or up when it would leave the window, and
 * closes on a click elsewhere, Escape, or when the window loses focus to the document.
 */
export const ContextMenu = ({ x, y, label, groups, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPlace({
      left: Math.max(margin, Math.min(x, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - box.height - margin)),
    });
  }, [x, y]);

  // The first entry takes the focus: keys work in the menu, and the window holds the focus, so a
  // click back into the document (its frame) blurs the window and closes the menu.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role^='menuitem']:not(:disabled)")?.focus();
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: place.left, top: place.top }}
      className="fixed z-30 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-lg"
    >
      <MenuList label={label} groups={groups} onDone={onClose} />
    </div>
  );
};
