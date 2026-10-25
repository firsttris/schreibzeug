import type { FileActions } from "./file-menu";
import type { OpenedFile } from "./opened-file";

/** What the edit page hands every editor view. */
export type EditorViewProps = {
  file: OpenedFile;
  /** The file's name now; it changes when someone renames it while it is open. */
  name: string;
  /**
   * Stores the saved file; the view shows "Gespeichert" once it resolves. Called by the save button
   * and on its own a few seconds after changes; keep it stable (useCallback).
   */
  onSave: (bytes: Uint8Array) => Promise<unknown>;
  /** What the "Datei" menu does with the file on the server (use-file-actions.tsx). */
  fileActions: FileActions;
  onRename?: ((name: string) => Promise<unknown>) | undefined;
  /**
   * Stores a new file beside the open one (in "Meine Dateien" when the folder is someone else's)
   * and resolves with the name it got, e.g. pages taken out of a PDF.
   */
  onCreateFile?: ((name: string, bytes: Uint8Array, type: string) => Promise<string>) | undefined;
  /**
   * Stores the bytes as the newest version and opens that version in place of what the editor
   * shows, e.g. a PDF once it is digitally signed.
   */
  onReplace?: ((bytes: Uint8Array) => Promise<void>) | undefined;
  /** The folder the file is in, where pickers start; null for the top of the user's files. */
  folderId?: string | null | undefined;
};
