import type { Align, SlideCommands, SlideState } from "@stapel/editor-core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Italic,
  LayoutTemplate,
  List,
  ListOrdered,
  type LucideIcon,
  Minus,
  Plus,
  Redo2,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { popoverPanel, usePopover } from "../ui/use-popover";
import { Choice } from "./choice";
import { ColorPicker } from "./color-picker";

const aligns: Array<{ value: Align; label: string; icon: LucideIcon }> = [
  { value: "left", label: "Linksbündig", icon: AlignLeft },
  { value: "center", label: "Zentriert", icon: AlignCenter },
  { value: "right", label: "Rechtsbündig", icon: AlignRight },
  { value: "justify", label: "Blocksatz", icon: AlignJustify },
];

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

type Toggle = { label: string; icon: LucideIcon; pressed: boolean; run: () => void };

const ToggleButton = ({ label, icon: Icon, pressed, run, disabled }: Toggle & { disabled: boolean }) => (
  <Button variant="toggle" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={run}>
    <Icon size={16} />
  </Button>
);

/** A grid of the master's layouts, each with the engine's picture of it. */
const LayoutPicker = ({
  label,
  layouts,
  disabled,
  onPick,
  children,
}: {
  label: string;
  layouts: SlideState["layouts"];
  disabled: boolean;
  onPick: (index: number) => void;
  children: ReactNode;
}) => {
  const { open, toggle, close, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        {children}
      </Button>
      {open && (
        <div role="menu" aria-label={label} className={`${popoverPanel} grid grid-cols-2 gap-2`}>
          {layouts.map((layout) => (
            <button
              key={layout.index}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(layout.index);
                close();
              }}
              className="flex w-36 flex-col items-center gap-1 rounded-md p-1.5 text-xs hover:bg-[var(--muted)]"
            >
              <img
                src={layout.image}
                alt=""
                className="w-full rounded-sm border border-[var(--border)] bg-white"
              />
              {layout.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export type SlideToolbarProps = { state: SlideState; commands: SlideCommands | null };

/** The row above the slides: slides and layouts, then the formatting of the text at the cursor. */
export const SlideToolbar = ({ state, commands }: SlideToolbarProps) => {
  const disabled = !commands || state.status !== "ready";
  const { text, catalog, document, layouts } = state;
  const fontSize = text.fontSize ?? 18;
  const run = (command: (commands: SlideCommands) => void) => () => commands && command(commands);

  const marks: Toggle[] = [
    { label: "Fett", icon: Bold, pressed: text.bold, run: run((c) => c.toggleBold()) },
    { label: "Kursiv", icon: Italic, pressed: text.italic, run: run((c) => c.toggleItalic()) },
    {
      label: "Unterstrichen",
      icon: Underline,
      pressed: text.underline,
      run: run((c) => c.toggleUnderline()),
    },
    {
      label: "Durchgestrichen",
      icon: Strikethrough,
      pressed: text.strikeout,
      run: run((c) => c.toggleStrikeout()),
    },
  ];
  const lists: Toggle[] = [
    {
      label: "Aufzählung",
      icon: List,
      pressed: state.list === "bullet",
      run: run((c) => c.toggleList("bullet")),
    },
    {
      label: "Nummerierung",
      icon: ListOrdered,
      pressed: state.list === "number",
      run: run((c) => c.toggleList("number")),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Formatierung"
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
    >
      <Button
        variant="ghost"
        aria-label="Rückgängig"
        disabled={disabled || !document.canUndo}
        onClick={run((c) => c.undo())}
      >
        <Undo2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Wiederholen"
        disabled={disabled || !document.canRedo}
        onClick={run((c) => c.redo())}
      >
        <Redo2 size={16} />
      </Button>
      <Separator />
      <LayoutPicker
        label="Neue Folie"
        layouts={layouts}
        disabled={disabled}
        onPick={(index) => commands?.addSlide(index)}
      >
        <Plus size={16} />
        <span className="text-sm">Folie</span>
      </LayoutPicker>
      <LayoutPicker
        label="Layout"
        layouts={layouts}
        disabled={disabled}
        onPick={(index) => commands?.setLayout(index)}
      >
        <LayoutTemplate size={16} />
      </LayoutPicker>
      <Button
        variant="ghost"
        aria-label="Folie duplizieren"
        disabled={disabled}
        onClick={run((c) => c.duplicateSlide())}
      >
        <Copy size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Folie löschen"
        disabled={disabled || document.pages <= 1}
        onClick={run((c) => c.deleteSlide())}
      >
        <Trash2 size={16} />
      </Button>
      <Separator />
      <Choice
        label="Schriftart"
        className="w-40"
        value={text.fontName}
        options={catalog.fonts.map((name) => ({ value: name, label: name }))}
        disabled={disabled}
        onChange={(name) => commands?.setFontName(name)}
      />
      <div className="ml-1 flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--background)]">
        <Button
          variant="ghost"
          aria-label="Schrift verkleinern"
          disabled={disabled}
          onClick={run((c) => c.setFontSize(fontSize - 1))}
        >
          <Minus size={14} />
        </Button>
        <span data-testid="font-size" className="w-9 text-center font-mono text-sm tabular-nums">
          {text.fontSize ?? "–"}
        </span>
        <Button
          variant="ghost"
          aria-label="Schrift vergrößern"
          disabled={disabled}
          onClick={run((c) => c.setFontSize(fontSize + 1))}
        >
          <Plus size={14} />
        </Button>
      </div>
      <Separator />
      {marks.map((toggle) => (
        <ToggleButton key={toggle.label} {...toggle} disabled={disabled} />
      ))}
      <ColorPicker color={text.color} disabled={disabled} onPick={(color) => commands?.setColor(color)} />
      <Separator />
      {lists.map((toggle) => (
        <ToggleButton key={toggle.label} {...toggle} disabled={disabled} />
      ))}
      <Separator />
      {aligns.map(({ value, label, icon }) => (
        <ToggleButton
          key={value}
          label={label}
          icon={icon}
          pressed={text.align === value}
          run={run((c) => c.setAlign(value))}
          disabled={disabled}
        />
      ))}
    </div>
  );
};
