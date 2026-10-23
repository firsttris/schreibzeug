import {
  createConverter,
  type EditorState,
  initialEditorState,
  mountEngineFrame,
  openWordDocument,
  type WordEditor,
} from "@stapel/editor-core";
import { type RefObject, useEffect, useState, useSyncExternalStore } from "react";
import type { OpenedFile } from "./files";

const noStore = {
  get: () => initialEditorState,
  subscribe: () => () => {},
};

export type WordEditorHandle = {
  editor: WordEditor | null;
  state: EditorState;
  failure: string | null;
};

const USER_KEY = "stapel:user-id";

/**
 * Who edits, until there are accounts: one id per browser, so two windows of one person count as
 * two participants only when they are two browsers. The name is the same for everyone for now.
 */
const localUser = () => {
  const stored = (() => {
    try {
      return localStorage.getItem(USER_KEY);
    } catch {
      return null;
    }
  })();
  const id = stored ?? `user-${crypto.randomUUID()}`;
  if (!stored) {
    try {
      localStorage.setItem(USER_KEY, id);
    } catch {
      // Without storage the id lives as long as the page; that is enough to edit.
    }
  }
  return { id, name: "Ich" };
};

/** Mounts the engine in the container and opens the file; closes both when the file changes. */
export const useWordEditor = (
  container: RefObject<HTMLDivElement | null>,
  file: OpenedFile,
): WordEditorHandle => {
  const [editor, setEditor] = useState<WordEditor | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let cancelled = false;
    let cleanup = () => {};

    setEditor(null);
    setFailure(null);
    const converter = createConverter();
    cleanup = converter.terminate;
    mountEngineFrame(host, { kind: "word" })
      .then(async (frame) => {
        cleanup = () => {
          converter.terminate();
          frame.remove();
        };
        if (cancelled) return cleanup();
        const opened = await openWordDocument(frame.window, {
          bytes: file.bytes,
          title: file.name,
          user: localUser(),
          convert: converter.convert,
          ...(file.collaboration ? { collaboration: file.collaboration } : {}),
        });
        cleanup = () => {
          opened.close();
          converter.terminate();
          frame.remove();
        };
        if (cancelled) return cleanup();
        setEditor(opened);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [container, file]);

  useEffect(() => {
    if (!editor) return;
    const onResize = () => editor.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [editor]);

  const store = editor?.store ?? noStore;
  const state = useSyncExternalStore(store.subscribe, store.get);
  return { editor, state, failure };
};
