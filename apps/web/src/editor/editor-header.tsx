import {
  ArrowLeft,
  Download,
  ExternalLink,
  History,
  PanelTopClose,
  PanelTopOpen,
  Save,
  Share2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useEmbed } from "../embed/bridge";
import { FileBadge } from "../files/file-badge";
import type { FileKind } from "../lib/format";
import { Button } from "../ui/button";
import type { MenuItem } from "../ui/menu";
import { type Menu, MenuBar } from "../ui/menu-bar";
import { attachRovingToolbars } from "../ui/roving-toolbar";
import { useNotice } from "../ui/use-notice";
import { type FileActions, fileMenu, helpMenu, type PdfActions, type ScreenReaderSwitch } from "./file-menu";
import { FileTitle } from "./file-title";
import { AboutDialog, type Shortcut, ShortcutsDialog } from "./help-dialogs";
import { type DocumentStatus, SaveStatus } from "./save-status";
import type { DocumentSave } from "./use-document-save";

export type EditorHeaderProps = {
  name: string;
  /** The badge in front of the name. */
  format: FileKind;
  document: DocumentStatus;
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
  /** Further formats to download in ("Datei" menu). */
  downloads?: MenuItem[];
  /** The editor's own menus between "Datei" and "Hilfe": Bearbeiten, Ansicht, Einfügen, Format. */
  menus: Menu[];
  shortcuts: Shortcut[];
  /** The engine's screen reader support, in "Hilfe"; none in editors without it. */
  screenReader?: ScreenReaderSwitch | null;
  /** A short message for the person, e.g. when the browser refused the clipboard. */
  notice?: string | null;
  /** Buttons of this editor before the shared ones (e.g. the comments toggle). */
  actions?: ReactNode;
  /** The editor's toolbar, under the title row. */
  toolbar: ReactNode;
};

/** A button's word, kept for screen readers on a phone, where the button shows only its icon. */
export const ButtonLabel = ({ children }: { children: string }) => (
  <span className="sr-only sm:not-sr-only">{children}</span>
);

type FileButtonsProps = {
  ready: boolean;
  file: FileActions;
  onDownload: () => void;
};

/** What is done with the file as a whole: open in a tab of its own, versions, download, share. */
const FileButtons = ({ ready, file, onDownload }: FileButtonsProps) => {
  const { embedded } = useEmbed();
  return (
    <>
      {embedded && (
        <a
          href={window.location.pathname}
          target="_blank"
          rel="noopener"
          aria-label="In neuem Tab öffnen"
          title="In neuem Tab öffnen"
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ExternalLink size={16} />
        </a>
      )}
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
          <ButtonLabel>Teilen</ButtonLabel>
        </Button>
      )}
    </>
  );
};

/**
 * The top of every editor, as in an office suite: back, the file's name (editable in place) with
 * what happens to it, the menus under it, the buttons on the right, then the editor's toolbar.
 * On a phone the document gets the room: one row with back, name, the editor's own buttons and
 * saving, and the menus, the file's buttons and the toolbar only after a tap on "Werkzeuge".
 */
export const EditorHeader = ({
  name,
  format,
  document,
  failure,
  saving: { save, saving, failure: saveFailure },
  ready,
  readOnly = false,
  file,
  onRename,
  onDownload,
  pdf = null,
  downloads = [],
  menus,
  shortcuts,
  screenReader = null,
  notice,
  actions,
  toolbar,
}: EditorHeaderProps) => {
  const [dialog, setDialog] = useState<"shortcuts" | "about" | null>(null);
  const [renameError, setRenameError] = useNotice();
  const message = notice ?? renameError;
  const [toolsOpen, setToolsOpen] = useState(false);
  // Every toolbar of the editor one stop for Tab, with the arrow keys inside (roving-toolbar.ts).
  const header = useRef<HTMLElement>(null);
  useEffect(() => (header.current ? attachRovingToolbars(header.current) : undefined), []);
  const menuBar = (
    <MenuBar
      label="Menü"
      menus={[fileMenu(file, onDownload, pdf, ready, downloads), ...menus, helpMenu(setDialog, screenReader)]}
    />
  );

  return (
    <header
      ref={header}
      className="flex flex-col gap-2 border-b border-[var(--border)] px-2 pt-1.5 pb-1.5 sm:px-4 sm:pt-2 sm:pb-2"
    >
      <div className="flex items-center gap-x-2 sm:flex-wrap sm:gap-x-3 sm:gap-y-2">
        <Button variant="ghost" aria-label="Zurück" onClick={file.onClose}>
          <ArrowLeft size={18} />
        </Button>
        <span className="hidden sm:contents">
          <FileBadge kind={format} size={32} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col sm:basis-48">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <FileTitle name={name} onRename={readOnly ? undefined : onRename} onError={setRenameError} />
            <SaveStatus
              document={document}
              failure={failure}
              saving={saving}
              saveFailure={saveFailure}
              readOnly={readOnly}
            />
          </div>
          <div className="hidden sm:block">{menuBar}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {actions}
          <span className="hidden items-center gap-2 sm:flex">
            <FileButtons ready={ready} file={file} onDownload={onDownload} />
          </span>
          <Button
            variant="ghost"
            aria-label="Werkzeuge"
            aria-expanded={toolsOpen}
            className="sm:hidden"
            onClick={() => setToolsOpen((open) => !open)}
          >
            {toolsOpen ? <PanelTopClose size={18} /> : <PanelTopOpen size={18} />}
          </Button>
          {!readOnly && (
            <Button variant="primary" disabled={!ready || saving} onClick={save}>
              <Save size={15} />
              <ButtonLabel>Speichern</ButtonLabel>
            </Button>
          )}
        </div>
      </div>
      {toolsOpen && (
        <div className="flex flex-wrap items-center gap-1 sm:hidden">
          {menuBar}
          <FileButtons ready={ready} file={file} onDownload={onDownload} />
        </div>
      )}
      {message && (
        <p role="status" data-testid="editor-notice" className="m-0 text-xs text-[var(--muted-foreground)]">
          {message}
        </p>
      )}
      {!readOnly && <div className={toolsOpen ? "" : "hidden sm:block"}>{toolbar}</div>}
      <ShortcutsDialog open={dialog === "shortcuts"} shortcuts={shortcuts} onClose={() => setDialog(null)} />
      <AboutDialog open={dialog === "about"} onClose={() => setDialog(null)} />
    </header>
  );
};
