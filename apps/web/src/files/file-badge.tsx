import { File, FileSpreadsheet, FileText, Folder, Presentation } from "lucide-react";
import type { FileKind } from "../lib/format";

const STYLE: Record<FileKind, { className: string; Icon: typeof File; label: string }> = {
  docx: { className: "bg-[var(--docx-muted)] text-[var(--docx)]", Icon: FileText, label: "Dokument" },
  xlsx: { className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]", Icon: FileSpreadsheet, label: "Tabelle" },
  pptx: { className: "bg-[var(--pptx-muted)] text-[var(--pptx)]", Icon: Presentation, label: "Präsentation" },
  csv: { className: "bg-[var(--xlsx-muted)] text-[var(--xlsx)]", Icon: FileSpreadsheet, label: "CSV" },
  pdf: { className: "bg-[var(--pdf-muted)] text-[var(--pdf)]", Icon: File, label: "PDF" },
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
