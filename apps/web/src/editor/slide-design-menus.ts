import type { DesignCommands, ShapeKind, SlideState, TransitionKind } from "@schreibzeug/editor-core";
import { TRANSITION_KINDS } from "@schreibzeug/editor-core";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

const SHAPES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: "textBox", label: "Textfeld" },
  { kind: "rectangle", label: "Rechteck" },
  { kind: "roundedRectangle", label: "Abgerundetes Rechteck" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "arrow", label: "Pfeil" },
  { kind: "line", label: "Linie" },
];

/** The engine's designs by their English names (sdkjs slide/themes/themes.js g_defaultThemes). */
const THEME_NAMES: Record<string, string> = {
  Blank: "Leer",
  Basic: "Einfach",
  Classic: "Klassisch",
  Official: "Offiziell",
  "Green leaf": "Grünes Blatt",
  Lines: "Linien",
  Office: "Office",
  Safari: "Safari",
  Dotted: "Gepunktet",
  Corner: "Ecke",
  Turtle: "Schildkröte",
};

export const themeLabel = (name: string): string => THEME_NAMES[name] ?? name;

const TRANSITION_LABELS: Record<TransitionKind, string> = {
  none: "Keiner",
  fade: "Verblassen",
  push: "Schieben",
  wipe: "Wischen",
  split: "Teilen",
  uncover: "Aufdecken",
  cover: "Überdecken",
  clock: "Uhr",
  zoom: "Zoom",
};

/** Shapes and the text box for "Einfügen" (presentationeditor main view/Toolbar.js btnInsertShape). */
export const shapeItems = (design: DesignCommands | null, off: boolean): MenuItem[] =>
  SHAPES.map(({ kind, label }) => ({
    label,
    disabled: off || !design,
    onSelect: () => design?.insertShape(kind),
  }));

/** The speaker notes under the slide, for "Ansicht" (main controller/ViewTab.js chNotes). */
export const notesItem = (state: SlideState, design: DesignCommands | null, off: boolean): MenuItem => ({
  label: "Notizen",
  checked: state.notes,
  disabled: off || !design,
  onSelect: () => design?.showNotes(!state.notes),
});

/**
 * "Design" and "Übergänge", as PowerPoint names its tabs: the designs the editor ships with (the
 * engine names the one in use only by its master, so none is checked); the transition into the selected slides, and spreading it to every slide
 * (main view/Transitions.js).
 */
export const designMenus = (state: SlideState, design: DesignCommands | null, off: boolean): Menu[] => {
  const disabled = off || !design;
  return [
    {
      label: "Design",
      groups: [
        state.themes.map((theme) => ({
          label: themeLabel(theme.name),
          disabled,
          onSelect: () => design?.setTheme(theme.index),
        })),
      ],
    },
    {
      label: "Übergänge",
      groups: [
        TRANSITION_KINDS.map((kind) => ({
          label: TRANSITION_LABELS[kind],
          checked: state.transition === kind,
          disabled: disabled || state.transition === null,
          onSelect: () => design?.setTransition(kind),
        })),
        [
          {
            label: "Auf alle Folien anwenden",
            disabled: disabled || state.transition === null,
            onSelect: () => design?.applyTransitionToAll(),
          },
        ],
      ],
    },
  ];
};
