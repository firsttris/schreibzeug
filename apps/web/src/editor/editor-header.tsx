import type { CoreState, OfficeFormat } from "@schreibzeug/editor-core";
import { ArrowLeft, Download, History, Save, Share2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { FileBadge } from "../files/file-badge";
import { Button } from "../ui/button";
import { type Menu, MenuBar } from "../ui/menu-bar";
import { useNotice } from "../ui/use-notice";
import { type FileActions, fileMenu, helpMenu, type PdfActions } from "./file-menu";
import { FileTitle } from "./file-title";
import { AboutDialog, type Shortcut, ShortcutsDialog } from "./help-dialogs";
import { SaveStatus } from "./save-status";
import type { DocumentSave } from "./use-document-save";

export type EditorHeaderProps = {
  name: string;
  format: OfficeFormat;
  state: CoreState;
  /** Why the editor could not open, if it could not. */
  failure: string | null;
  saving: DocumentSave;
  ready: boolean;
  /** Opened to look at only: no saving and no toolbar. */
  readOnly?: boolean;
  /** What the "Datei" menu does with the file on the server. */
  file: FileActions;
  onRename?: ((name: string) => Promise<unknown>) | undefined;
  onDownload: () => void;
  /** A PDF of the document to download or print, where the editor can make one. */
  pdf?: PdfActions;
  /** The editor's own menus between "Datei" and "Hilfe": Bearbeiten, Ansicht, Einfügen, Format. */
  menus: Menu[];
  shortcuts: Shortcut[];
  /** A short message for the person, e.g. when the browser refused the clipboard. */
  notice?: string | null;
  /** Buttons of this editor before the shared ones (e.g. the comments toggle). */
  actions?: ReactNode;
  /** The editor's toolbar, under the title row. */
  toolbar: ReactNode;
};

/**
 * The top of every editor, as in an office suite: back, the file's name (editable in place) with
 * what happens to it, the menus under it, the buttons on the right, then the editor's toolbar.
 */
export const EditorHeader = ({
  name,
  format,
  state,
  failure,
  saving: { save, saving, failure: saveFailure },
  ready,
  readOnly = false,
  file,
  onRename,
  onDownload,
  pdf = null,
  menus,
  shortcuts,
  notice,
  actions,
  toolbar,
}: EditorHeaderProps) => {
  const [dialog, setDialog] = useState<"shortcuts" | "about" | null>(null);
  const [renameError, setRenameError] = useNotice();
  const message = notice ?? renameError;

  return (
    <header className="flex flex-col gap-2 border-b border-[var(--border)] px-4 pt-2 pb-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" aria-label="Zurück" onClick={file.onClose}>
          <ArrowLeft size={18} />
        </Button>
        <FileBadge kind={format} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-3">
            <FileTitle name={name} onRename={readOnly ? undefined : onRename} onError={setRenameError} />
            <SaveStatus
              state={state}
              failure={failure}
              saving={saving}
              saveFailure={saveFailure}
              readOnly={readOnly}
            />
          </div>
          <MenuBar
            label="Menü"
            menus={[fileMenu(file, onDownload, pdf, ready), ...menus, helpMenu(setDialog)]}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {file.onShowVersions && (
            <Button variant="ghost" aria-label="Versionen" onClick={file.onShowVersions}>
              <History size={16} />
            </Button>
          )}
          <Button variant="ghost" aria-label="Herunterladen" disabled={!ready} onClick={onDownload}>
            <Download size={16} />
          </Button>
          {file.onShare && (
            <Button variant="outline" onClick={file.onShare}>
              <Share2 size={15} />
              Teilen
            </Button>
          )}
          {!readOnly && (
            <Button variant="primary" disabled={!ready || saving} onClick={save}>
              <Save size={15} />
              Speichern
            </Button>
          )}
        </div>
      </div>
      {message && (
        <p role="status" data-testid="editor-notice" className="m-0 text-xs text-[var(--muted-foreground)]">
          {message}
        </p>
      )}
      {!readOnly && toolbar}
      <ShortcutsDialog open={dialog === "shortcuts"} shortcuts={shortcuts} onClose={() => setDialog(null)} />
      <AboutDialog open={dialog === "about"} onClose={() => setDialog(null)} />
    </header>
  );
};
