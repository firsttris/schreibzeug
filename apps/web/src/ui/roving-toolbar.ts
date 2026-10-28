/**
 * A toolbar as one stop for Tab, as the ARIA toolbar pattern has it
 * (https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): Tab reaches the button last used (the first
 * at the start), the arrow keys, Home and End go along the buttons. Fields keep their own stop and
 * their arrow keys (a font list, a size), and the buttons in a panel a button opened (a colour,
 * a table's rows) are the panel's, not the toolbar's. Works on the DOM, so the toolbars of every
 * editor get it without each knowing.
 */
import { moveFocus } from "./menu-keys";

const OUTSIDE = '[role="menu"], [role="dialog"], [data-panel]';

/** The toolbar's own buttons, in order: enabled, not in a panel or a nested toolbar. */
export const toolbarItems = (toolbar: HTMLElement): HTMLButtonElement[] =>
  [...toolbar.querySelectorAll("button")].filter(
    (button) =>
      !button.disabled && button.closest('[role="toolbar"]') === toolbar && !button.closest(OUTSIDE),
  );

/** Makes the toolbar roving; returns what undoes it. */
export const attachRovingToolbar = (toolbar: HTMLElement): (() => void) => {
  let active: HTMLElement | null = null;
  const apply = () => {
    const items = toolbarItems(toolbar);
    const current = active && items.includes(active as HTMLButtonElement) ? active : items[0];
    for (const item of items) item.tabIndex = item === current ? 0 : -1;
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!toolbarItems(toolbar).includes(event.target as HTMLButtonElement)) return;
    active = event.target as HTMLElement;
    apply();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const items = toolbarItems(toolbar);
    if (!items.includes(event.target as HTMLButtonElement)) return;
    if (moveFocus(event.key, items, "horizontal")) event.preventDefault();
  };
  // Buttons come and go with the selection (a table's tools) and turn disabled and back.
  const observer = new MutationObserver(apply);
  observer.observe(toolbar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled"],
  });
  toolbar.addEventListener("focusin", onFocusIn);
  toolbar.addEventListener("keydown", onKeyDown);
  apply();
  return () => {
    observer.disconnect();
    toolbar.removeEventListener("focusin", onFocusIn);
    toolbar.removeEventListener("keydown", onKeyDown);
  };
};

/** Every toolbar inside `root`, also those that appear later (after "Werkzeuge" on a phone). */
export const attachRovingToolbars = (root: HTMLElement): (() => void) => {
  const attached = new Map<HTMLElement, () => void>();
  const scan = () => {
    for (const toolbar of root.querySelectorAll<HTMLElement>('[role="toolbar"]'))
      if (!attached.has(toolbar)) attached.set(toolbar, attachRovingToolbar(toolbar));
    for (const [toolbar, detach] of attached)
      if (!root.contains(toolbar)) {
        detach();
        attached.delete(toolbar);
      }
  };
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return () => {
    observer.disconnect();
    for (const detach of attached.values()) detach();
  };
};
