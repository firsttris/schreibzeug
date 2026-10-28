import { CHANGED_SINCE } from "@schreibzeug/files-api";
import {
  ENCODING_LABEL,
  encodeText,
  sha256Hex,
  type TextEditor,
  type TextForm,
} from "@schreibzeug/text-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { isApiFailure, messageOf } from "../api/client";
import { m } from "../paraglide/messages";
import type { DocumentSave } from "./use-document-save";

/** How long after the last change the text saves on its own; slower after a failed save. */
export const TEXT_AUTOSAVE_DELAY = { normal: 2_000, fallback: 15_000 } as const;

export type TextSave = DocumentSave & {
  /**
   * Someone saved the file after this text was made from it: it no longer saves on its own, until
   * the person loads the new version or keeps theirs as a copy (conflict-dialog.tsx).
   */
  conflict: boolean;
  /** The question what to do is open; closing it keeps the text and the conflict. */
  asking: boolean;
  dismiss: () => void;
};

/** The file in its own form; a character its encoding has no byte for is a failure, not lost. */
export const textBytes = (
  text: string,
  form: TextForm,
): { ok: true; bytes: Uint8Array } | { ok: false; message: string } => {
  const encoded = encodeText(text, form);
  return encoded.ok
    ? encoded
    : {
        ok: false,
        message: m.use_text_save_unencodable({
          character: encoded.character,
          encoding: ENCODING_LABEL[form.encoding],
        }),
      };
};

/**
 * Saving a text file by hand and on its own, a few seconds after the last change. Each save is
 * made over the version the last one stored (or the one opened); when someone saved in between,
 * the server refuses it (409) and the person chooses what happens (conflict-dialog.tsx), instead
 * of one of the two texts being overwritten.
 */
export const useTextSave = ({
  editor,
  form,
  openedSha256,
  modified,
  readOnly,
  store,
}: {
  editor: TextEditor | null;
  form: TextForm;
  openedSha256: string;
  /** Changed since the last save (the editor's state); every new change starts the wait again. */
  modified: { value: boolean; revision: number };
  readOnly: boolean;
  /** Stores the bytes over the version with that SHA-256. */
  store: (bytes: Uint8Array, over: string) => Promise<unknown>;
}): TextSave => {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [asking, setAsking] = useState(false);
  const over = useRef(openedSha256);
  const running = useRef<Promise<void> | null>(null);

  const saveOnce = useCallback(async () => {
    // An unchanged file is not written: its bytes stay as they are, also lines that end otherwise.
    if (!editor || readOnly || !editor.state().modified) return;
    const text = editor.text();
    const encoded = textBytes(text, form);
    if (!encoded.ok) return setFailure(encoded.message);
    setFailure(null);
    try {
      await store(encoded.bytes, over.current);
      over.current = await sha256Hex(encoded.bytes);
      editor.markSaved(text);
    } catch (error) {
      const changedSince =
        isApiFailure(error) && error.status === 409 && error.error.message === CHANGED_SINCE;
      setFailure(
        m.use_text_save_not_saved({
          reason: changedSince ? m.use_text_save_changed_since() : messageOf(error),
        }),
      );
      if (changedSince) {
        setConflict(true);
        setAsking(true);
      }
    }
  }, [editor, form, readOnly, store]);

  // A save asked for while one runs follows it, so it holds what was typed meanwhile.
  const save = useCallback(async () => {
    const next = (running.current ?? Promise.resolve()).then(saveOnce);
    running.current = next;
    setSaving(true);
    await next;
    if (running.current === next) {
      running.current = null;
      setSaving(false);
    }
  }, [saveOnce]);

  const wait = failure ? TEXT_AUTOSAVE_DELAY.fallback : TEXT_AUTOSAVE_DELAY.normal;
  // biome-ignore lint/correctness/useExhaustiveDependencies: every new change starts the wait again
  useEffect(() => {
    if (readOnly || !modified.value || saving || conflict) return;
    const timer = setTimeout(() => void save(), wait);
    return () => clearTimeout(timer);
  }, [readOnly, modified.value, modified.revision, saving, conflict, wait, save]);

  return { save, saving, failure, conflict, asking, dismiss: () => setAsking(false) };
};
