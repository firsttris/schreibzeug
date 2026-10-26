import type { FileNode, SessionSave } from "@schreibzeug/files-api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentType, lazy, Suspense, useCallback, useState } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { type EditorOf, editorOf, isLegacyFile, isTextFile, kindOf } from "../lib/format";
import { ConvertPage } from "./convert-page";
import type { OpenedFile } from "./opened-file";
import { Failure, Loading } from "./page-states";
import { PdfView } from "./pdf-view";
import type { EditorViewProps } from "./props";
import { SheetView } from "./sheet-view";
import { SlideView } from "./slide-view";
import { useEditorPage } from "./use-editor-page";
import { useSessionFile } from "./use-session-file";
import { WordView } from "./word-view";

/** CodeMirror and its Markdown come with the first text file opened, not with every page. */
const TextPage = lazy(() => import("./text-page").then(({ TextPage }) => ({ default: TextPage })));

/** The editor view for each editor (lib/format.ts editorOf). */
const VIEWS: Record<Exclude<EditorOf, "text">, ComponentType<EditorViewProps>> = {
  word: WordView,
  sheet: SheetView,
  slide: SlideView,
  pdf: PdfView,
};

/**
 * Opens a file from the server: a text file in the text editor, which saves it whole, anything
 * else in its editing session, which saves it back as a new version.
 */
export const EditPage = ({ fileId }: { fileId: string }) => {
  const { queries } = useFiles();
  const { data, error } = useQuery(queries.node(fileId));
  // Once known, a failed refresh of the node (lists refresh after every save) keeps the editor open.
  if (!data) return error ? <Failure message={messageOf(error)} /> : <Loading />;
  return isTextFile(data) ? (
    <Suspense fallback={<Loading />}>
      <TextPage fileId={fileId} node={data} />
    </Suspense>
  ) : (
    <SessionPage fileId={fileId} node={data} />
  );
};

const SessionPage = ({ fileId, node }: { fileId: string; node: FileNode }) => {
  const [generation, setGeneration] = useState(0);
  const opened = useSessionFile(fileId, generation);

  if (opened.status === "loading") return <Loading />;
  if (opened.status === "error") return <Failure message={opened.message} />;
  return (
    <OpenedPage
      fileId={fileId}
      file={opened.file}
      node={node}
      // The restored version becomes the newest; open it in place of what the editor shows.
      onRestored={() => setGeneration((current) => current + 1)}
    />
  );
};

type OpenedPageProps = {
  fileId: string;
  file: OpenedFile & { parentId: string | null; owned: boolean };
  node: FileNode | undefined;
  onRestored: () => void;
};

const OpenedPage = ({ fileId, file, node, onRestored }: OpenedPageProps) => {
  const { commands } = useFiles();
  const queryClient = useQueryClient();
  const store = useCallback(
    async (bytes: Uint8Array, session?: SessionSave) => {
      await commands.save(fileId, bytes, session);
      await refreshFiles(queryClient);
    },
    [commands, fileId, queryClient],
  );
  const page = useEditorPage({
    name: file.name,
    node,
    parentId: file.parentId,
    owned: file.owned,
    onRestored,
  });
  const createFile = async (name: string, bytes: Uint8Array, type: string) =>
    (await page.createFile(name, bytes, type)).name;

  if (isLegacyFile({ kind: "file", name: file.name })) {
    return <ConvertPage file={file} name={node?.name ?? file.name} onClose={() => void page.close()} />;
  }
  const editor = editorOf(kindOf({ kind: "file", name: file.name }));
  if (!editor || editor === "text")
    return <Failure message="Diese Datei kann Schreibzeug noch nicht bearbeiten." />;
  const View = VIEWS[editor];
  return (
    <>
      <View
        file={file}
        fileId={fileId}
        name={node?.name ?? file.name}
        onSave={store}
        fileActions={page.actions}
        onRename={page.onRename}
        onCreateFile={createFile}
        folderId={file.owned ? file.parentId : null}
        onReplace={async (bytes) => {
          await store(bytes);
          onRestored();
        }}
      />
      {page.dialogs}
    </>
  );
};
