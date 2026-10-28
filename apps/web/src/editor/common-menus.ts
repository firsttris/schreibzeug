import type { ClipboardAction, ViewCommands } from "@schreibzeug/editor-core";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";

/** The entries every editor's menus share: the clipboard, search and zoom. */

const KEYS: Record<ClipboardAction, string> = { copy: "Ctrl+C", cut: "Ctrl+X", paste: "Ctrl+V" };

/** The hint web-apps gives too when the browser keeps the clipboard from a menu entry. */
export const clipboardHint = (action: ClipboardAction): string =>
  m.common_menus_clipboard_hint({ keys: keys(KEYS[action]) });

/** Cut, copy, paste: in "Bearbeiten" and in the context menu. */
export const clipboardItems = (
  view: ViewCommands | null,
  onRefused: (action: ClipboardAction) => void,
): MenuItem[] =>
  (
    [
      ["cut", m.common_cut],
      ["copy", m.common_copy],
      ["paste", m.common_paste],
    ] as const
  ).map(([action, label]) => ({
    label: label(),
    shortcut: keys(KEYS[action]),
    disabled: !view,
    onSelect: () => {
      if (view && !view.clipboard(action)) onRefused(action);
    },
  }));

export const searchItems = (onFind: (mode: "find" | "replace") => void, disabled: boolean): MenuItem[] => [
  { label: m.common_find(), shortcut: keys("Ctrl+F"), disabled, onSelect: () => onFind("find") },
  {
    label: m.common_menus_find_replace(),
    shortcut: keys("Ctrl+H"),
    disabled,
    onSelect: () => onFind("replace"),
  },
];

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

/** "Vergrößern", "Verkleinern", the steps with the current one checked, and fitting where there is a page. */
export const zoomGroups = (view: ViewCommands | null, zoom: number | null): MenuItem[][] => {
  const fits: MenuItem[] = [
    ...(view?.fitWidth ? [{ label: m.common_menus_fit_width(), onSelect: view.fitWidth }] : []),
    ...(view?.fitPage ? [{ label: m.common_menus_fit_page(), onSelect: view.fitPage }] : []),
  ];
  return [
    [
      { label: m.common_menus_zoom_in(), disabled: !view, onSelect: () => view?.zoomIn() },
      { label: m.common_menus_zoom_out(), disabled: !view, onSelect: () => view?.zoomOut() },
    ],
    ZOOM_STEPS.map((percent) => ({
      label: m.common_menus_zoom_percent({ percent }),
      checked: zoom === percent,
      disabled: !view,
      onSelect: () => view?.setZoom(percent),
    })),
    fits,
  ];
};
