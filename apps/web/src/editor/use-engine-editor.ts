import {
  type CoreState,
  convertForEngine,
  type EditorKind,
  type EngineWindow,
  mountEngineFrame,
  type OpenedDocument,
  type OpenOptions,
  type Store,
} from "@schreibzeug/editor-core";
import { simplifyMergeFields } from "@schreibzeug/ooxml";
import { type RefObject, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useUser } from "../account/context";
import { kindOf } from "../lib/format";
import { readSpellCheck } from "../settings/spell-check";
import { ENGINE_PATH, newConverter } from "./engine";
import type { OpenedFile } from "./opened-file";
import { isPhone } from "./use-mobile-view";

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
    const converter = newConverter();
    cleanup = converter.terminate;
    const fileKind = kindOf({ kind: "file", name: file.name });
    const reading = {
      // Word's merge fields are complex fields, which the engine does not merge (merge-fields.ts).
      bytes: fileKind === "docx" ? simplifyMergeFields(file.bytes) : file.bytes,
      convert: converter.convert,
      csv: fileKind === "csv",
      openDocument: ["odt", "ods", "odp"].includes(fileKind),
    };
    // The converter and the frame load at once: x2t compiles and converts the file in its worker
    // while the frame parses sdkjs. A failure shows when the document opens with it.
    const converted = convertForEngine(reading, kind);
    converted.catch(() => {});
    mountEngineFrame(host, { kind, enginePath: ENGINE_PATH })
      .then(async (frame) => {
        cleanup = () => {
          converter.terminate();
          frame.remove();
        };
        if (cancelled) return cleanup();
        const opened = await open(frame.window, {
          ...reading,
          converted,
          title: file.name,
          user: { id: userId, name: userName },
          renderPdf: converter.renderPdf,
          applyPdfChanges: converter.applyPdfChanges,
          writePdfA: converter.writePdfA,
          mode: file.readOnly ? "view" : "edit",
          spellCheck: readSpellCheck(),
          phone: isPhone(),
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
