import { type CoreState, hasUnsavedChanges } from "@schreibzeug/editor-core";
import { Check, Eye, LoaderCircle, WifiOff } from "lucide-react";
import { useEffect } from "react";
import { useReportUnsaved } from "../embed/bridge";

type Status = "loading" | "ready" | "error";

type StatusFacts = {
  status: Status;
  readOnly: boolean;
  modified: boolean;
  saving: boolean;
  connected: boolean;
  failure: string | null;
};

const statusText = ({ status, readOnly, modified, saving, connected, failure }: StatusFacts): string => {
  if (failure) return failure;
  if (status === "loading") return "Öffnet …";
  if (status === "error") return "Fehler beim Öffnen";
  if (!connected) return "Verbindung unterbrochen, verbindet neu …";
  if (readOnly) return "Nur ansehen";
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

export type SaveStatusProps = {
  state: CoreState;
  /** Why the editor could not open, if it could not. */
  failure: string | null;
  saving: boolean;
  saveFailure: string | null;
  readOnly: boolean;
};

/** What happens to the file: opening, saving, saved, connection lost, or only looking. */
export const SaveStatus = ({ state, failure, saving, saveFailure, readOnly }: SaveStatusProps) => {
  const status: Status = failure ? "error" : state.status;
  const { connected } = state.document;
  // What a viewer sees may not be stored yet, but that is for the editors to save.
  const modified = !readOnly && hasUnsavedChanges(state);
  useLeaveWarning(modified);
  useReportUnsaved(modified);
  return (
    <span
      data-testid="editor-status"
      data-status={status}
      data-modified={modified}
      data-connected={connected}
      className={`flex shrink-0 items-center gap-1.5 text-xs ${saveFailure || !connected ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
    >
      {!connected && <WifiOff size={12} />}
      {connected && (status === "loading" || saving) && <LoaderCircle size={12} className="animate-spin" />}
      {connected && status === "ready" && readOnly && <Eye size={12} />}
      {connected && status === "ready" && !readOnly && !saving && !modified && !saveFailure && (
        <Check size={12} />
      )}
      {statusText({ status, readOnly, modified, saving, connected, failure: failure ?? saveFailure })}
    </span>
  );
};
