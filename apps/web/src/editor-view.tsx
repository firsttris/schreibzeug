import { ArrowLeft, Check, Download, FileText, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { docxName, downloadBytes, type OpenedFile } from "./files";
import { Toolbar } from "./toolbar";
import { Button } from "./ui/button";
import { useWordEditor } from "./use-word-editor";

const statusText = (status: string, modified: boolean, failure: string | null): string => {
  if (failure) return failure;
  if (status === "loading") return "Öffnet …";
  if (status === "error") return "Fehler beim Öffnen";
  return modified ? "Geändert" : "Gespeichert";
};

export type EditorViewProps = { file: OpenedFile; onClose: () => void };

export const EditorView = ({ file, onClose }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useWordEditor(container, file);
  const [saving, setSaving] = useState(false);
  const status = failure ? "error" : state.status;

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      downloadBytes(await editor.save(), docxName(file.name));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-2 border-b border-[var(--border)] px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" aria-label="Zurück" onClick={onClose}>
            <ArrowLeft size={18} />
          </Button>
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--docx-muted)] text-[var(--docx)]">
            <FileText size={18} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold">{file.name}</span>
            <span
              data-testid="editor-status"
              data-status={status}
              className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]"
            >
              {status === "loading" && <LoaderCircle size={12} className="animate-spin" />}
              {status === "ready" && !state.document.modified && <Check size={12} />}
              {statusText(state.status, state.document.modified, failure)}
            </span>
          </div>
          <Button variant="primary" className="ml-auto" disabled={!editor || saving} onClick={save}>
            <Download size={15} />
            Speichern
          </Button>
        </div>
        <Toolbar state={state} commands={editor?.commands ?? null} />
      </header>
      <div ref={container} className="min-h-0 flex-1 bg-[var(--muted)]" />
    </div>
  );
};
