import { File, FileSpreadsheet, FileText, FileType, Folder, NotebookPen, Presentation } from "lucide-react";
import type { FileKind } from "../lib/format";
import { m } from "../paraglide/messages";

/** A format's own name (CSV, PDF, Word 97–2003, …) reads the same in every language. */
const named = (name: string) => () => name;

const STYLE: Record<FileKind, { className: string; Icon: typeof File; label: () => string }> = {
  docx: {
    className: "bg-[var(--docx-muted)] text-[var(--docx)]",
    Icon: FileText,
    label: m.file_badge_document,
  },
  xlsx: {
    className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]",
    Icon: FileSpreadsheet,
    label: m.file_badge_spreadsheet,
  },
  pptx: {
    className: "bg-[var(--pptx-muted)] text-[var(--pptx)]",
    Icon: Presentation,
    label: m.file_badge_presentation,
  },
  csv: { className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]", Icon: FileSpreadsheet, label: named("CSV") },
  pdf: { className: "bg-[var(--pdf-muted)] text-[var(--pdf)]", Icon: File, label: named("PDF") },
  odt: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: m.file_badge_odt },
  ods: {
    className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]",
    Icon: FileSpreadsheet,
    label: m.file_badge_ods,
  },
  odp: {
    className: "bg-[var(--pptx-muted)] text-[var(--pptx)]",
    Icon: Presentation,
    label: m.file_badge_odp,
  },
  doc: {
    className: "bg-[var(--docx-muted)] text-[var(--docx)]",
    Icon: FileText,
    label: named("Word 97–2003"),
  },
  rtf: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: named("RTF") },
  xls: {
    className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]",
    Icon: FileSpreadsheet,
    label: named("Excel 97–2003"),
  },
  ppt: {
    className: "bg-[var(--pptx-muted)] text-[var(--pptx)]",
    Icon: Presentation,
    label: named("PowerPoint 97–2003"),
  },
  md: { className: "bg-[var(--md-muted)] text-[var(--md)]", Icon: NotebookPen, label: m.file_badge_markdown },
  txt: { className: "bg-[var(--txt-muted)] text-[var(--txt)]", Icon: FileType, label: m.file_badge_text },
  folder: {
    className: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    Icon: Folder,
    label: m.file_badge_folder,
  },
  other: {
    className: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    Icon: File,
    label: m.file_badge_file,
  },
};

/** The coloured icon in front of a name; the colour says the kind before the name is read. */
export const FileBadge = ({ kind, size = 32 }: { kind: FileKind; size?: number }) => {
  const { className, Icon, label } = STYLE[kind];
  return (
    <span
      title={label()}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg ${className}`}
    >
      <Icon size={Math.round(size * 0.55)} aria-hidden />
    </span>
  );
};
