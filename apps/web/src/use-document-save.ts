import { AUTOSAVE_DELAY, autosaveDelay, type EditorState, type WordEditor } from "@stapel/editor-core";
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
 * session-progress.ts). After a failed save it tries again at the slower pace.
 */
export const useDocumentSave = (
  editor: WordEditor | null,
  state: EditorState,
  store: (bytes: Uint8Array) => Promise<unknown>,
): DocumentSave => {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef<Promise<void> | null>(null);

  const saveOnce = useCallback(async () => {
    if (!editor) return;
    setFailure(null);
    try {
      const saved = await editor.save();
      await store(saved.bytes);
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

  const ready = state.status === "ready" && state.document.connected;
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
