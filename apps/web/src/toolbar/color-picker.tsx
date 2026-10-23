import type { TextColor } from "@stapel/editor-core";
import { Baseline, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";

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

/**
 * Closes on a click elsewhere and on Escape, like a menu. A click into the document lands in the
 * engine's iframe and never reaches this document; the window losing focus stands for it.
 */
const useDismiss = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
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
  return ref;
};

export type ColorPickerProps = { color: TextColor; disabled: boolean; onPick: (color: TextColor) => void };

/** Text colour: the letter with a bar in the current colour, opening a palette with "Automatisch". */
export const ColorPicker = ({ color, disabled, onPick }: ColorPickerProps) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
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
        onClick={() => setOpen(!open)}
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
        <fieldset className="absolute top-9 left-0 z-10 m-0 flex w-max flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-lg">
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
