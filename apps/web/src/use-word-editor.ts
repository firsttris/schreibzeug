import {
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
    mountEngineFrame(host, { kind: "word" })
      .then(async (frame) => {
        cleanup = frame.remove;
        if (cancelled) return frame.remove();
        const opened = await openWordDocument(frame.window, {
          bytes: file.bytes,
          title: file.name,
          user: { id: "local", name: "Ich" },
        });
        cleanup = () => {
          opened.close();
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
