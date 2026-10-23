import type { OpenedFile } from "./opened-file";

/** What the edit page hands every editor view. */
export type EditorViewProps = {
  file: OpenedFile;
  onClose: () => void;
  /**
   * Stores the saved file; the view shows "Gespeichert" once it resolves. Called by the save button
   * and on its own a few seconds after changes; keep it stable (useCallback).
   */
  onSave: (bytes: Uint8Array) => Promise<unknown>;
  /** Opens the file's versions; absent where the file has none (not stored on a server). */
  onShowVersions?: () => void;
};
