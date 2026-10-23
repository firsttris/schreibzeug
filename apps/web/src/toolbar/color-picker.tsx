import type { TextColor } from "@stapel/editor-core";
import { Baseline, Check } from "lucide-react";
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

export type ColorPickerProps = { color: TextColor; disabled: boolean; onPick: (color: TextColor) => void };

/** Text colour: the letter with a bar in the current colour, opening a palette with "Automatisch". */
export const ColorPicker = ({ color, disabled, onPick }: ColorPickerProps) => {
  const { open, toggle, close, ref } = usePopover();
  const pick = (value: TextColor) => {
    onPick(value);
    close();
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        aria-label="Schriftfarbe"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className="flex-col gap-0"
      >
        <Baseline size={16} />
        <span
          aria-hidden
          className="-mt-0.5 h-1 w-4 rounded-sm"
          style={{ background: color ?? "var(--foreground)" }}
        />
      </Button>
      {open && (
        <fieldset className={popoverPanel}>
          <legend className="sr-only">Schriftfarben</legend>
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)]"
          >
            <span className="size-4 rounded-sm border border-[var(--border)] bg-[var(--foreground)]" />
            Automatisch
            {color === null && <Check size={14} className="ml-auto" aria-hidden />}
          </button>
          <div className="grid grid-cols-10 gap-1">
            {COLORS.map(({ value, name }) => (
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
