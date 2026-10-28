/**
 * F6 and Umschalt+F6: from the document to the menus, the toolbar and back, as Word and LibreOffice
 * do; in the document Tab is a tab or the next cell, so this is the keyboard's way out. A part that
 * is not shown (the menus and toolbar on a phone before "Werkzeuge") is passed over.
 */

type Shown = (element: HTMLElement) => boolean;

const isShown: Shown = (element) => element.getClientRects().length > 0;

/** Focuses the part's stop for Tab (a roving toolbar's current button), else its first button. */
const focusPart = (part: HTMLElement | null, shown: Shown): boolean => {
  if (!part || !shown(part)) return false;
  const target =
    part.querySelector<HTMLElement>('button[tabindex="0"]') ??
    part.querySelector<HTMLElement>("button:not(:disabled)");
  if (!target) return false;
  target.focus();
  return true;
};

/**
 * Moves the focus `step` parts on: 0 the menu bar, 1 the first toolbar, 2 the document, where
 * `focusDocument` puts it.
 */
export const moveRegion = (
  root: Document,
  step: 1 | -1,
  focusDocument: () => void,
  shown: Shown = isShown,
): void => {
  const menuBar = root.querySelector<HTMLElement>('[role="menubar"]');
  const toolbar = [...root.querySelectorAll<HTMLElement>('[role="toolbar"]')].find(shown) ?? null;
  const parts = [
    () => focusPart(menuBar, shown),
    () => focusPart(toolbar, shown),
    () => {
      focusDocument();
      return true;
    },
  ];
  const active = root.activeElement;
  const current = menuBar?.contains(active) ? 0 : toolbar?.contains(active) ? 1 : 2;
  for (let i = 1; i <= parts.length; i++) {
    const next = (current + step * i + parts.length * 2) % parts.length;
    if (parts[next]?.()) return;
  }
};
