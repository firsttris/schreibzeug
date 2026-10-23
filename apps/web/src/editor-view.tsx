import { ArrowLeft, Check, Download, FileText, LoaderCircle, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { docxName, downloadBytes, type OpenedFile } from "./files";
import { Toolbar } from "./toolbar/toolbar";
import { Button } from "./ui/button";
import { useWordEditor } from "./use-word-editor";

type Status = "loading" | "ready" | "error";

const statusText = (status: Status, modified: boolean, saving: boolean, failure: string | null): string => {
  if (failure) return failure;
  if (status === "loading") return "Öffnet …";
  if (status === "error") return "Fehler beim Öffnen";
  if (saving) return "Speichert …";
  return modified ? "Nicht gespeicherte Änderungen" : "Gespeichert";
};

/** Asks before the tab closes while there are changes the server does not have yet. */
const useLeaveWarning = (active: boolean) => {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
};

export type EditorViewProps = {
  file: OpenedFile;
  onClose: () => void;
  /** Stores the saved .docx; the view shows "Gespeichert" once it resolves. */
  onSave: (bytes: Uint8Array) => Promise<unknown>;
};

export const EditorView = ({ file, onClose, onSave }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useWordEditor(container, file);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const status: Status = failure ? "error" : state.status;
  const modified = state.document.modified;
  useLeaveWarning(modified);

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    setSaveFailure(null);
    try {
      await onSave(await editor.save());
      editor.markSaved();
    } catch (error) {
      setSaveFailure(`Nicht gespeichert: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (editor) downloadBytes(await editor.save(), docxName(file.name));
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
              data-modified={modified}
              className={`flex items-center gap-1.5 text-xs ${saveFailure ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
            >
              {(status === "loading" || saving) && <LoaderCircle size={12} className="animate-spin" />}
              {status === "ready" && !saving && !modified && !saveFailure && <Check size={12} />}
              {statusText(status, modified, saving, failure ?? saveFailure)}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" aria-label="Herunterladen" disabled={!editor} onClick={download}>
              <Download size={16} />
            </Button>
            <Button variant="primary" disabled={!editor || saving} onClick={save}>
              <Save size={15} />
              Speichern
            </Button>
          </div>
        </div>
        <Toolbar state={state} commands={editor?.commands ?? null} />
      </header>
      <div ref={container} className="min-h-0 flex-1 bg-[var(--muted)]" />
    </div>
  );
};
