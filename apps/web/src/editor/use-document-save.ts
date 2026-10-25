import { AUTOSAVE_DELAY, autosaveDelay, type CoreState, type OpenedDocument } from "@schreibzeug/editor-core";
import { useCallback, useEffect, useRef, useState } from "react";

export type DocumentSave = {
  save: () => Promise<void>;
  saving: boolean;
  failure: string | null;
};

/**
 * Saving by hand and on its own. In a shared session the changes live only in the relay's memory
 * until someone stores them, so the editor saves a few seconds after the last change: the author
 * of the newest change first, everyone else later if that did not happen (editor-core
 * session-progress.ts). After a failed save it tries again at the slower pace. A document opened
 * read-only is never saved.
 */
export const useDocumentSave = <S extends CoreState>(
  editor: OpenedDocument<S> | null,
  state: S,
  store: (bytes: Uint8Array, logIndex: number) => Promise<unknown>,
  readOnly = false,
): DocumentSave => {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef<Promise<void> | null>(null);

  const saveOnce = useCallback(async () => {
    if (!editor) return;
    setFailure(null);
    try {
      const saved = await editor.save();
      // The save tells the relay itself how much of the log it holds: a connection that drops
      // meanwhile cannot send schreibzeug:saved (apps/server collab/hub.ts `stored`).
      await store(saved.bytes, saved.seen);
      editor.markSaved(saved);
    } catch (error) {
      setFailure(`Nicht gespeichert: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [editor, store]);

  // A save asked for while one runs follows it, so it holds what was typed meanwhile.
  const save = useCallback(async () => {
    const previous = running.current;
    const next = (previous ?? Promise.resolve()).then(saveOnce);
    running.current = next;
    setSaving(true);
    await next;
    if (running.current === next) {
      running.current = null;
      setSaving(false);
    }
  }, [saveOnce]);

  const ready = !readOnly && state.status === "ready" && state.document.connected;
  const delay = autosaveDelay(state.session, state.document.modified);
  const wait = delay === null ? null : failure ? AUTOSAVE_DELAY.fallback : delay;

  // biome-ignore lint/correctness/useExhaustiveDependencies: every new change starts the wait again
  useEffect(() => {
    if (!ready || saving || wait === null) return;
    const timer = setTimeout(() => void save(), wait);
    return () => clearTimeout(timer);
  }, [ready, saving, wait, save, state.session.seen]);

  return { save, saving, failure };
};
