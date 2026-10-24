import type { PageCommands, PdfCommands, PdfState, PdfTool } from "@schreibzeug/editor-core";
import {
  Circle,
  FilePlus2,
  Hand,
  Highlighter,
  type LucideIcon,
  MessageSquarePlus,
  MousePointer2,
  PenLine,
  Redo2,
  RotateCcw,
  RotateCw,
  Signature,
  Slash,
  Square,
  SquareX,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "../ui/button";

const Separator = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />;

/** The tools of the toolbar, grouped as web-apps' PDF editor groups them (pdfeditor Toolbar.js). */
const TOOL_GROUPS: Array<Array<{ tool: PdfTool; label: string; icon: LucideIcon }>> = [
  [
    { tool: "select", label: "Auswählen", icon: MousePointer2 },
    { tool: "hand", label: "Verschieben", icon: Hand },
  ],
  [
    { tool: "highlight", label: "Text hervorheben", icon: Highlighter },
    { tool: "underline", label: "Text unterstreichen", icon: Underline },
    { tool: "strikeout", label: "Text durchstreichen", icon: Strikethrough },
  ],
  [
    { tool: "draw", label: "Freihand zeichnen", icon: PenLine },
    { tool: "square", label: "Rechteck", icon: Square },
    { tool: "circle", label: "Ellipse", icon: Circle },
    { tool: "line", label: "Linie", icon: Slash },
  ],
];

export type PdfToolbarProps = {
  state: PdfState;
  commands: PdfCommands | null;
  pages: PageCommands | null;
  onAddNote: () => void;
  /** Opens the signature dialog; null where no picture can be put on the page. */
  onSign: (() => void) | null;
  /** Tells the person why a command did nothing. */
  notify: (message: string) => void;
};

/** History, the tools for a click on the page, notes and text, pages, and blacking out. */
export const PdfToolbar = ({ state, commands, pages, onAddNote, onSign, notify }: PdfToolbarProps) => {
  const off = !commands || state.status !== "ready";
  const { tool, document } = state;
  const pick = (next: PdfTool) => commands?.setTool(tool === next && next !== "select" ? "select" : next);

  return (
    <div role="toolbar" aria-label="PDF-Werkzeuge" className="flex flex-wrap items-center gap-0.5">
      <Button
        variant="ghost"
        aria-label="Rückgängig"
        disabled={off || !document.canUndo}
        onClick={() => commands?.undo()}
      >
        <Undo2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Wiederholen"
        disabled={off || !document.canRedo}
        onClick={() => commands?.redo()}
      >
        <Redo2 size={16} />
      </Button>
      {TOOL_GROUPS.map((group) => (
        <span key={group[0]?.tool} className="flex items-center gap-0.5">
          <Separator />
          {group.map(({ tool: entry, label, icon: Icon }) => (
            <Button
              key={entry}
              variant="toggle"
              aria-label={label}
              aria-pressed={tool === entry}
              disabled={off}
              onClick={() => pick(entry)}
            >
              <Icon size={16} />
            </Button>
          ))}
        </span>
      ))}
      <Separator />
      <Button variant="ghost" aria-label="Notiz" disabled={off} onClick={onAddNote}>
        <MessageSquarePlus size={16} />
      </Button>
      <Button variant="ghost" aria-label="Textfeld" disabled={off} onClick={() => commands?.addTextBox()}>
        <Type size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Unterschreiben"
        disabled={off || !onSign}
        onClick={() => onSign?.()}
      >
        <Signature size={16} />
      </Button>
      <Separator />
      <Button
        variant="ghost"
        aria-label="Seite nach links drehen"
        disabled={off}
        onClick={() => pages?.rotate("left")}
      >
        <RotateCcw size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Seite nach rechts drehen"
        disabled={off}
        onClick={() => pages?.rotate("right")}
      >
        <RotateCw size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Leere Seite einfügen"
        disabled={off}
        onClick={() => pages?.addBlank("after")}
      >
        <FilePlus2 size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label="Seite löschen"
        disabled={off || document.pages <= 1}
        onClick={() => {
          if (pages && !pages.remove()) notify("Die letzte Seite eines PDFs kann nicht gelöscht werden.");
        }}
      >
        <Trash2 size={16} />
      </Button>
      <Separator />
      <Button
        variant="toggle"
        aria-label="Schwärzen"
        aria-pressed={tool === "redact"}
        disabled={off}
        onClick={() => pick("redact")}
      >
        <SquareX size={16} />
      </Button>
      {tool === "redact" && (
        <Button
          variant="outline"
          disabled={off}
          onClick={() => {
            if (!commands?.hasRedactions()) return notify("Es sind keine Bereiche zum Schwärzen markiert.");
            commands.applyRedactions();
            commands.setTool("select");
          }}
        >
          Schwärzungen anwenden
        </Button>
      )}
    </div>
  );
};
