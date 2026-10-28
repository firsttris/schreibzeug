/**
 * Arrow keys in menus as the ARIA pattern for menus and menu bars has them
 * (https://www.w3.org/WAI/ARIA/apg/patterns/menubar/): the next or previous entry, wrapping
 * around, Home and End for the first and last. Null for any other key.
 */
export const nextIndex = (key: string, current: number, count: number, axis: "vertical" | "horizontal") => {
  if (count === 0) return null;
  const [back, forward] = axis === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
};

/** Moves the focus among the elements for an arrow key; true when the key was one of them. */
export const moveFocus = (key: string, elements: HTMLElement[], axis: "vertical" | "horizontal"): boolean => {
  const current = elements.indexOf(document.activeElement as HTMLElement);
  const next = nextIndex(key, current, elements.length, axis);
  if (next === null) return false;
  elements[next]?.focus();
  return true;
};
