import {
  type CoreState,
  createConverter,
  type EditorKind,
  type EngineWindow,
  mountEngineFrame,
  type OpenedDocument,
  type OpenOptions,
  type Store,
} from "@schreibzeug/editor-core";
import { type RefObject, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useUser } from "../account/context";
import type { OpenedFile } from "./opened-file";

export type EngineEditorHandle<E extends OpenedDocument<S>, S extends CoreState> = {
  editor: E | null;
  state: S;
  failure: string | null;
};

/**
 * Mounts the engine of one editor in the container and opens the file with it; closes both when the
 * file changes. `open` is the editor's entry point in editor-core (openWordDocument, …) and must be
 * a stable function.
 */
export const useEngineEditor = <E extends OpenedDocument<S>, S extends CoreState>(
  container: RefObject<HTMLDivElement | null>,
  file: OpenedFile,
  kind: EditorKind,
  open: (win: EngineWindow, options: OpenOptions) => Promise<E>,
  initialState: S,
): EngineEditorHandle<E, S> => {
  // Who edits: the engine shows the name at the cursor and on comments; the relay checks the id.
  const { id: userId, name: userName } = useUser();
  const [editor, setEditor] = useState<E | null>(null);
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
    mountEngineFrame(host, { kind })
      .then(async (frame) => {
        cleanup = () => {
          converter.terminate();
          frame.remove();
        };
        if (cancelled) return cleanup();
        const opened = await open(frame.window, {
          bytes: file.bytes,
          title: file.name,
          user: { id: userId, name: userName },
          convert: converter.convert,
          renderPdf: converter.renderPdf,
          mode: file.readOnly ? "view" : "edit",
          ...(file.collaboration ? { collaboration: file.collaboration } : {}),
          ...(file.images ? { images: file.images } : {}),
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
  }, [container, file, kind, open, userId, userName]);

  useEffect(() => {
    if (!editor) return;
    const onResize = () => editor.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [editor]);

  const idle = useMemo<Pick<Store<S>, "get" | "subscribe">>(
    () => ({ get: () => initialState, subscribe: () => () => {} }),
    [initialState],
  );
  const store = editor?.store ?? idle;
  const state = useSyncExternalStore(store.subscribe, store.get);
  return { editor, state, failure };
};
