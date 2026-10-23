import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Open state for a small menu next to its button. It closes on a click elsewhere and on Escape. A
 * click into the document lands in the engine's iframe and never reaches this document; the window
 * losing focus stands for it.
 */
export const usePopover = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!open) return;
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
  }, [open, close]);

  return { open, toggle, close, ref };
};

/** The look of the panel under a toolbar button. */
export const popoverPanel =
  "absolute top-9 left-0 z-10 m-0 flex w-max flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-lg";
