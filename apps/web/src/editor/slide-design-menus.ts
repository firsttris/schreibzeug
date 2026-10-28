import type { DesignCommands, ShapeKind, SlideState, TransitionKind } from "@schreibzeug/editor-core";
import { TRANSITION_KINDS } from "@schreibzeug/editor-core";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

const SHAPES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: "textBox", label: m.slide_design_menus_text_box() },
  { kind: "rectangle", label: m.slide_design_menus_rectangle() },
  { kind: "roundedRectangle", label: m.slide_design_menus_rounded_rectangle() },
  { kind: "ellipse", label: m.slide_design_menus_ellipse() },
  { kind: "arrow", label: m.slide_design_menus_arrow() },
  { kind: "line", label: m.slide_design_menus_line() },
];

/** The engine's designs by their English names (sdkjs slide/themes/themes.js g_defaultThemes). */
const THEME_NAMES: Record<string, string> = {
  Blank: m.slide_design_menus_theme_blank(),
  Basic: m.slide_design_menus_theme_basic(),
  Classic: m.slide_design_menus_theme_classic(),
  Official: m.slide_design_menus_theme_official(),
  "Green leaf": m.slide_design_menus_theme_green_leaf(),
  Lines: m.slide_design_menus_theme_lines(),
  Office: m.slide_design_menus_theme_office(),
  Safari: m.slide_design_menus_theme_safari(),
  Dotted: m.slide_design_menus_theme_dotted(),
  Corner: m.slide_design_menus_theme_corner(),
  Turtle: m.slide_design_menus_theme_turtle(),
};

export const themeLabel = (name: string): string => THEME_NAMES[name] ?? name;

const TRANSITION_LABELS: Record<TransitionKind, string> = {
  none: m.slide_design_menus_transition_none(),
  fade: m.slide_design_menus_transition_fade(),
  push: m.slide_design_menus_transition_push(),
  wipe: m.slide_design_menus_transition_wipe(),
  split: m.slide_design_menus_transition_split(),
  uncover: m.slide_design_menus_transition_uncover(),
  cover: m.slide_design_menus_transition_cover(),
  clock: m.slide_design_menus_transition_clock(),
  zoom: m.slide_design_menus_transition_zoom(),
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
  label: m.slide_design_menus_notes(),
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
      label: m.slide_design_menus_design(),
      groups: [
        state.themes.map((theme) => ({
          label: themeLabel(theme.name),
          disabled,
          onSelect: () => design?.setTheme(theme.index),
        })),
      ],
    },
    {
      label: m.slide_design_menus_transitions(),
      groups: [
        TRANSITION_KINDS.map((kind) => ({
          label: TRANSITION_LABELS[kind],
          checked: state.transition === kind,
          disabled: disabled || state.transition === null,
          onSelect: () => design?.setTransition(kind),
        })),
        [
          {
            label: m.slide_design_menus_apply_to_all(),
            disabled: disabled || state.transition === null,
            onSelect: () => design?.applyTransitionToAll(),
          },
        ],
      ],
    },
  ];
};
