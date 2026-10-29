import type {
  Align,
  EditorState,
  LayoutCommands,
  MarkingCommands,
  ReviewCommands,
  TextCommands,
} from "@schreibzeug/editor-core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FilePenLine,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  type LucideIcon,
  MessageSquarePlus,
  Minus,
  Paintbrush,
  Plus,
  Redo2,
  Strikethrough,
  TextSelect,
  Underline,
  Undo2,
} from "lucide-react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Choice } from "./choice";
import { ColorPicker } from "./color-picker";
import { ParagraphSpacing } from "./paragraph-spacing";
import { styleLabel } from "./style-labels";
import { TableMenu } from "./table-menu";

const aligns: Array<{ value: Align; label: string; icon: LucideIcon }> = [
  { value: "left", label: m.toolbar_align_left(), icon: AlignLeft },
  { value: "center", label: m.toolbar_align_center(), icon: AlignCenter },
  { value: "right", label: m.toolbar_align_right(), icon: AlignRight },
  { value: "justify", label: m.toolbar_justify(), icon: AlignJustify },
];

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

type Toggle = { label: string; icon: LucideIcon; pressed: boolean; run: () => void };

const ToggleButton = ({ label, icon: Icon, pressed, run, disabled }: Toggle & { disabled: boolean }) => (
  <Button variant="toggle" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={run}>
    <Icon size={16} />
  </Button>
);

export type ToolbarProps = {
  state: EditorState;
  commands: TextCommands | null;
  layout: LayoutCommands | null;
  marking: MarkingCommands | null;
  review: ReviewCommands | null;
  /** Opens the comment field for the selection; comments live beside the document. */
  onAddComment: () => void;
  /** Opens the file dialog for an image; null where none can be put in. */
  onInsertImage: (() => void) | null;
  onInsertLink: () => void;
};

/** The formatting row above the document: every control reads EditorState and calls a command. */
export const Toolbar = ({
  state,
  commands,
  layout,
  marking,
  review,
  onAddComment,
  onInsertImage,
  onInsertLink,
}: ToolbarProps) => {
  const disabled = !commands || state.status !== "ready";
  const { text, paragraph, catalog, document } = state;
  const fontSize = text.fontSize ?? 11;
  const run = (command: (commands: TextCommands) => void) => () => commands && command(commands);

  const marks: Toggle[] = [
    { label: m.common_bold(), icon: Bold, pressed: text.bold, run: run((c) => c.toggleBold()) },
    { label: m.common_italic(), icon: Italic, pressed: text.italic, run: run((c) => c.toggleItalic()) },
    {
      label: m.common_underline(),
      icon: Underline,
      pressed: text.underline,
      run: run((c) => c.toggleUnderline()),
    },
    {
      label: m.toolbar_strikethrough(),
      icon: Strikethrough,
      pressed: text.strikeout,
      run: run((c) => c.toggleStrikeout()),
    },
  ];
  const lists: Toggle[] = [
    {
      label: m.toolbar_bullets(),
      icon: List,
      pressed: paragraph.list === "bullet",
      run: run((c) => c.toggleList("bullet")),
    },
    {
      label: m.toolbar_numbering(),
      icon: ListOrdered,
      pressed: paragraph.list === "number",
      run: run((c) => c.toggleList("number")),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label={m.toolbar_formatting()}
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
    >
      <Button
        variant="ghost"
        aria-label={m.common_undo()}
        disabled={disabled || !document.canUndo}
        onClick={run((c) => c.undo())}
      >
        <Undo2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label={m.common_redo()}
        disabled={disabled || !document.canRedo}
        onClick={run((c) => c.redo())}
      >
        <Redo2 size={16} />
      </Button>
      <Separator />
      <Choice
        label={m.toolbar_paragraph_style()}
        className="w-36"
        value={paragraph.style}
        options={catalog.styles.map((name) => ({ value: name, label: styleLabel(name) }))}
        disabled={disabled}
        onChange={(name) => commands?.setStyle(name)}
      />
      <Choice
        label={m.toolbar_font()}
        className="ml-1 w-36"
        value={text.fontName}
        options={catalog.fonts.map((name) => ({ value: name, label: name }))}
        disabled={disabled}
        onChange={(name) => commands?.setFontName(name)}
      />
      <div className="ml-1 flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--background)]">
        <Button
          variant="ghost"
          aria-label={m.toolbar_font_smaller()}
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
          aria-label={m.toolbar_font_larger()}
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
      <ColorPicker
        target="highlight"
        color={state.marks.highlight}
        disabled={disabled || !marking}
        onPick={(color) => marking?.highlight(color)}
      />
      <Button
        variant="toggle"
        aria-label={m.toolbar_paint_format()}
        aria-pressed={state.marks.painting}
        disabled={disabled || !marking}
        onClick={() => marking?.togglePaintFormat(!state.marks.painting)}
      >
        <Paintbrush size={16} />
      </Button>
      <Separator />
      {lists.map((toggle) => (
        <ToggleButton key={toggle.label} {...toggle} disabled={disabled} />
      ))}
      <ParagraphSpacing lineSpacing={paragraph.lineSpacing} layout={layout} disabled={disabled} />
      <TableMenu inTable={paragraph.inTable} disabled={disabled} commands={commands} />
      <Button
        variant="ghost"
        aria-label={m.toolbar_insert_image()}
        disabled={disabled || !onInsertImage}
        onClick={() => onInsertImage?.()}
      >
        <ImagePlus size={16} />
      </Button>
      <Button variant="ghost" aria-label={m.toolbar_insert_link()} disabled={disabled} onClick={onInsertLink}>
        <Link size={16} />
      </Button>
      <Button variant="ghost" aria-label={m.toolbar_add_comment()} disabled={disabled} onClick={onAddComment}>
        <MessageSquarePlus size={16} />
      </Button>
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
      <Separator />
      <Button
        variant="ghost"
        aria-label={m.common_select_all()}
        disabled={disabled}
        onClick={run((c) => c.selectAll())}
      >
        <TextSelect size={16} />
      </Button>
      <ToggleButton
        label={m.toolbar_track_changes()}
        icon={FilePenLine}
        pressed={state.review.tracking}
        run={() => review?.setTracking(!state.review.tracking)}
        disabled={disabled || !review}
      />
    </div>
  );
};
