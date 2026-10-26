import { File, FileSpreadsheet, FileText, FileType, Folder, NotebookPen, Presentation } from "lucide-react";
import type { FileKind } from "../lib/format";

const STYLE: Record<FileKind, { className: string; Icon: typeof File; label: string }> = {
  docx: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: "Dokument" },
  xlsx: { className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]", Icon: FileSpreadsheet, label: "Tabelle" },
  pptx: { className: "bg-[var(--pptx-muted)] text-[var(--pptx)]", Icon: Presentation, label: "Präsentation" },
  csv: { className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]", Icon: FileSpreadsheet, label: "CSV" },
  pdf: { className: "bg-[var(--pdf-muted)] text-[var(--pdf)]", Icon: File, label: "PDF" },
  odt: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: "OpenDocument-Text" },
  ods: {
    className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]",
    Icon: FileSpreadsheet,
    label: "OpenDocument-Tabelle",
  },
  odp: {
    className: "bg-[var(--pptx-muted)] text-[var(--pptx)]",
    Icon: Presentation,
    label: "OpenDocument-Präsentation",
  },
  doc: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: "Word 97–2003" },
  rtf: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: "RTF" },
  xls: {
    className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]",
    Icon: FileSpreadsheet,
    label: "Excel 97–2003",
  },
  ppt: {
    className: "bg-[var(--pptx-muted)] text-[var(--pptx)]",
    Icon: Presentation,
    label: "PowerPoint 97–2003",
  },
  md: { className: "bg-[var(--md-muted)] text-[var(--md)]", Icon: NotebookPen, label: "Markdown-Notiz" },
  txt: { className: "bg-[var(--txt-muted)] text-[var(--txt)]", Icon: FileType, label: "Textdatei" },
  folder: { className: "bg-[var(--muted)] text-[var(--muted-foreground)]", Icon: Folder, label: "Ordner" },
  other: { className: "bg-[var(--muted)] text-[var(--muted-foreground)]", Icon: File, label: "Datei" },
};

/** The coloured icon in front of a name; the colour says the kind before the name is read. */
export const FileBadge = ({ kind, size = 32 }: { kind: FileKind; size?: number }) => {
  const { className, Icon, label } = STYLE[kind];
  return (
    <span
      title={label}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg ${className}`}
    >
      <Icon size={Math.round(size * 0.55)} aria-hidden />
    </span>
  );
};
