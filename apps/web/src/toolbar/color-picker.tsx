import type { TextColor } from "@schreibzeug/editor-core";
import { Baseline, Check, Highlighter, PaintBucket } from "lucide-react";
import { Button } from "../ui/button";
import { popoverPanel, usePopover } from "../ui/use-popover";

/** Word's ten standard colours, so a colour picked here is one Word users know. */
const COLORS: Array<{ value: string; name: string }> = [
  { value: "#c00000", name: "Dunkelrot" },
  { value: "#ff0000", name: "Rot" },
  { value: "#ffc000", name: "Orange" },
  { value: "#ffff00", name: "Gelb" },
  { value: "#92d050", name: "Hellgrün" },
  { value: "#00b050", name: "Grün" },
  { value: "#00b0f0", name: "Hellblau" },
  { value: "#0070c0", name: "Blau" },
  { value: "#002060", name: "Dunkelblau" },
  { value: "#7030a0", name: "Lila" },
];

/** Word's highlight colours, the first of web-apps' palette (editor-core HIGHLIGHT_COLORS). */
const HIGHLIGHTS: Array<{ value: string; name: string }> = [
  { value: "#ffff00", name: "Gelb" },
  { value: "#00ff00", name: "Hellgrün" },
  { value: "#00ffff", name: "Türkis" },
  { value: "#ff00ff", name: "Pink" },
  { value: "#ff0000", name: "Rot" },
];

export type ColorPickerProps = {
  color: TextColor;
  disabled: boolean;
  onPick: (color: TextColor) => void;
  /** What is coloured: the text (default), a cell's fill, or the highlight behind text. */
  target?: "text" | "fill" | "highlight";
};

const TARGETS = {
  text: {
    label: "Schriftfarbe",
    palette: "Schriftfarben",
    none: "Automatisch",
    Icon: Baseline,
    colors: COLORS,
  },
  fill: {
    label: "Füllfarbe",
    palette: "Füllfarben",
    none: "Keine Füllung",
    Icon: PaintBucket,
    colors: COLORS,
  },
  highlight: {
    label: "Hervorheben",
    palette: "Markierungsfarben",
    none: "Keine Markierung",
    Icon: Highlighter,
    colors: HIGHLIGHTS,
  },
} as const;

/**
 * A colour button: the icon with a bar in the current colour, opening Word's palette and the
 * colour-less choice ("Automatisch" for text, "Keine Füllung" for a fill).
 */
export const ColorPicker = ({ color, disabled, onPick, target = "text" }: ColorPickerProps) => {
  const { label, palette, none, Icon, colors } = TARGETS[target];
  const { open, toggle, close, ref } = usePopover();
  const pick = (value: TextColor) => {
    onPick(value);
    close();
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className="flex-col gap-0"
      >
        <Icon size={16} />
        <span
          aria-hidden
          className="-mt-0.5 h-1 w-4 rounded-sm"
          style={{ background: color ?? (target === "text" ? "var(--foreground)" : "transparent") }}
        />
      </Button>
      {open && (
        <fieldset className={popoverPanel}>
          <legend className="sr-only">{palette}</legend>
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)]"
          >
            <span
              className={`size-4 rounded-sm border border-[var(--border)] ${target === "text" ? "bg-[var(--foreground)]" : ""}`}
            />
            {none}
            {color === null && <Check size={14} className="ml-auto" aria-hidden />}
          </button>
          <div className="grid grid-cols-10 gap-1">
            {colors.map(({ value, name }) => (
              <button
                key={value}
                type="button"
                aria-label={name}
                aria-pressed={color === value}
                title={name}
                onClick={() => pick(value)}
                style={{ background: value }}
                className="size-6 rounded-sm outline-offset-1 hover:scale-110 aria-pressed:outline-2 aria-pressed:outline-[var(--foreground)]"
              />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
};
