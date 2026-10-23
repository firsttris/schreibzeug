import { type CoreState, hasUnsavedChanges, type OfficeFormat } from "@stapel/editor-core";
import { ArrowLeft, Check, Download, History, LoaderCircle, Save, WifiOff } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { FileBadge } from "../files/file-badge";
import { Button } from "../ui/button";
import type { DocumentSave } from "./use-document-save";

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

export type EditorHeaderProps = {
  name: string;
  format: OfficeFormat;
  state: CoreState;
  /** Why the editor could not open, if it could not. */
  failure: string | null;
  saving: DocumentSave;
  ready: boolean;
  onClose: () => void;
  onDownload: () => void;
  /** Opens the file's versions; absent where the file has none (not stored on a server). */
  onShowVersions?: (() => void) | undefined;
  /** Buttons of this editor before the shared ones (e.g. the comments toggle). */
  actions?: ReactNode;
  /** The editor's toolbar, under the title row. */
  toolbar: ReactNode;
};

/**
 * The top of every editor: back, the file's name and what happens to it (opening, saving, saved,
 * connection lost), versions, download and save, then the editor's toolbar.
 */
export const EditorHeader = ({
  name,
  format,
  state,
  failure,
  saving: { save, saving, failure: saveFailure },
  ready,
  onClose,
  onDownload,
  onShowVersions,
  actions,
  toolbar,
}: EditorHeaderProps) => {
  const status: Status = failure ? "error" : state.status;
  const { connected } = state.document;
  const modified = hasUnsavedChanges(state);
  useLeaveWarning(modified);

  return (
    <header className="flex flex-col gap-2 border-b border-[var(--border)] px-4 pt-3 pb-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" aria-label="Zurück" onClick={onClose}>
          <ArrowLeft size={18} />
        </Button>
        <FileBadge kind={format} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{name}</span>
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
          {actions}
          {onShowVersions && (
            <Button variant="ghost" aria-label="Versionen" onClick={onShowVersions}>
              <History size={16} />
            </Button>
          )}
          <Button variant="ghost" aria-label="Herunterladen" disabled={!ready} onClick={onDownload}>
            <Download size={16} />
          </Button>
          <Button variant="primary" disabled={!ready || saving} onClick={save}>
            <Save size={15} />
            Speichern
          </Button>
        </div>
      </div>
      {toolbar}
    </header>
  );
};
