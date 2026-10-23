import { hasUnsavedChanges } from "@stapel/editor-core";
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  Save,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommentsPanel } from "./comments/comments-panel";
import { docxName, downloadBytes, type OpenedFile } from "./files";
import { Toolbar } from "./toolbar/toolbar";
import { Button } from "./ui/button";
import { useDocumentSave } from "./use-document-save";
import { useWordEditor } from "./use-word-editor";

type Status = "loading" | "ready" | "error";

type StatusFacts = {
  status: Status;
  modified: boolean;
  saving: boolean;
  connected: boolean;
  failure: string | null;
};

const statusText = ({ status, modified, saving, connected, failure }: StatusFacts): string => {
  if (failure) return failure;
  if (status === "loading") return "Öffnet …";
  if (status === "error") return "Fehler beim Öffnen";
  if (!connected) return "Verbindung unterbrochen, verbindet neu …";
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
  /**
   * Stores the saved .docx; the view shows "Gespeichert" once it resolves. Called by the save
   * button and on its own a few seconds after changes; keep it stable (useCallback).
   */
  onSave: (bytes: Uint8Array) => Promise<unknown>;
  /** Opens the file's versions; absent where the file has none (not stored on a server). */
  onShowVersions?: () => void;
};

export const EditorView = ({ file, onClose, onSave, onShowVersions }: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useWordEditor(container, file);
  const { save, saving, failure: saveFailure } = useDocumentSave(editor, state, onSave);
  const status: Status = failure ? "error" : state.status;
  const { connected } = state.document;
  const modified = hasUnsavedChanges(state);
  useLeaveWarning(modified);
  const [comments, setComments] = useState<"closed" | "open" | "composing">("closed");
  const openComments = state.comments.filter((comment) => !comment.resolved).length;

  // The engine measures its frame only on resize; the panel takes width from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the panel opens or closes
  useEffect(() => {
    editor?.resize();
  }, [editor, comments === "closed"]);

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, docxName(file.name));
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
              data-connected={connected}
              className={`flex items-center gap-1.5 text-xs ${saveFailure || !connected ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
            >
              {!connected && <WifiOff size={12} />}
              {connected && (status === "loading" || saving) && (
                <LoaderCircle size={12} className="animate-spin" />
              )}
              {connected && status === "ready" && !saving && !modified && !saveFailure && <Check size={12} />}
              {statusText({ status, modified, saving, connected, failure: failure ?? saveFailure })}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="toggle"
              aria-label="Kommentare"
              aria-pressed={comments !== "closed"}
              disabled={!editor}
              onClick={() => setComments(comments === "closed" ? "open" : "closed")}
            >
              <MessageSquare size={16} />
              {openComments > 0 && <span className="text-xs tabular-nums">{openComments}</span>}
            </Button>
            {onShowVersions && (
              <Button variant="ghost" aria-label="Versionen" onClick={onShowVersions}>
                <History size={16} />
              </Button>
            )}
            <Button variant="ghost" aria-label="Herunterladen" disabled={!editor} onClick={download}>
              <Download size={16} />
            </Button>
            <Button variant="primary" disabled={!editor || saving} onClick={save}>
              <Save size={15} />
              Speichern
            </Button>
          </div>
        </div>
        <Toolbar
          state={state}
          commands={editor?.commands ?? null}
          onAddComment={() => setComments("composing")}
        />
      </header>
      <div className="flex min-h-0 flex-1">
        <div ref={container} className="min-w-0 flex-1 bg-[var(--muted)]" />
        {comments !== "closed" && (
          <CommentsPanel
            comments={state.comments}
            active={state.activeComments}
            commands={editor?.comments ?? null}
            composing={comments === "composing"}
            onComposed={() => setComments("open")}
            onClose={() => setComments("closed")}
          />
        )}
      </div>
    </div>
  );
};
