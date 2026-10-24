import type { ClipboardAction, ViewCommands } from "@stapel/editor-core";
import type { MenuItem } from "../ui/menu";

/** The entries every editor's menus share: the clipboard, search and zoom. */

const KEYS: Record<ClipboardAction, string> = { copy: "Strg+C", cut: "Strg+X", paste: "Strg+V" };

/** The hint web-apps gives too when the browser keeps the clipboard from a menu entry. */
export const clipboardHint = (action: ClipboardAction): string =>
  `Der Browser erlaubt das nur über die Tastatur: ${KEYS[action]}.`;

/** Cut, copy, paste: in "Bearbeiten" and in the context menu. */
export const clipboardItems = (
  view: ViewCommands | null,
  onRefused: (action: ClipboardAction) => void,
): MenuItem[] =>
  (
    [
      ["cut", "Ausschneiden"],
      ["copy", "Kopieren"],
      ["paste", "Einfügen"],
    ] as const
  ).map(([action, label]) => ({
    label,
    shortcut: KEYS[action],
    disabled: !view,
    onSelect: () => {
      if (view && !view.clipboard(action)) onRefused(action);
    },
  }));

export const searchItems = (onFind: (mode: "find" | "replace") => void, disabled: boolean): MenuItem[] => [
  { label: "Suchen", shortcut: "Strg+F", disabled, onSelect: () => onFind("find") },
  { label: "Suchen und ersetzen", shortcut: "Strg+H", disabled, onSelect: () => onFind("replace") },
];

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

/** "Vergrößern", "Verkleinern", the steps with the current one checked, and fitting where there is a page. */
export const zoomGroups = (view: ViewCommands | null, zoom: number | null): MenuItem[][] => {
  const fits: MenuItem[] = [
    ...(view?.fitWidth ? [{ label: "Seitenbreite", onSelect: view.fitWidth }] : []),
    ...(view?.fitPage ? [{ label: "Ganze Seite", onSelect: view.fitPage }] : []),
  ];
  return [
    [
      { label: "Vergrößern", disabled: !view, onSelect: () => view?.zoomIn() },
      { label: "Verkleinern", disabled: !view, onSelect: () => view?.zoomOut() },
    ],
    ZOOM_STEPS.map((percent) => ({
      label: `${percent} %`,
      checked: zoom === percent,
      disabled: !view,
      onSelect: () => view?.setZoom(percent),
    })),
    fits,
  ];
};
