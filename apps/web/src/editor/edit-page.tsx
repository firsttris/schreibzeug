import type { FileNode } from "@schreibzeug/files-api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ComponentType, useCallback, useState } from "react";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { useReportTitle } from "../embed/bridge";
import { type EditorOf, editorOf, isLegacyFile, kindOf } from "../lib/format";
import { ConvertPage } from "./convert-page";
import type { OpenedFile } from "./opened-file";
import { PdfView } from "./pdf-view";
import type { EditorViewProps } from "./props";
import { SheetView } from "./sheet-view";
import { SlideView } from "./slide-view";
import { useFileActions } from "./use-file-actions";
import { useSessionFile } from "./use-session-file";
import { WordView } from "./word-view";

/** The editor view for each editor (lib/format.ts editorOf). */
const VIEWS: Record<EditorOf, ComponentType<EditorViewProps>> = {
  word: WordView,
  sheet: SheetView,
  slide: SlideView,
  pdf: PdfView,
};

const Failure = ({ message }: { message: string }) => (
  <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
    <p className="m-0">{message}</p>
    <Link to="/">Zu meinen Dateien</Link>
  </div>
);

/** Opens a file from the server in its editing session and saves it back as a new version. */
export const EditPage = ({ fileId }: { fileId: string }) => {
  const { queries } = useFiles();
  const [generation, setGeneration] = useState(0);
  const node = useQuery(queries.node(fileId));
  const opened = useSessionFile(fileId, generation);

  if (opened.status === "loading") {
    return (
      <p role="status" className="m-0 p-8 text-sm text-[var(--muted-foreground)]">
        Lädt …
      </p>
    );
  }
  if (opened.status === "error") return <Failure message={opened.message} />;
  return (
    <OpenedPage
      fileId={fileId}
      file={opened.file}
      node={node.data}
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
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const store = useCallback(
    async (bytes: Uint8Array) => {
      await commands.save(fileId, bytes);
      await refreshFiles(queryClient);
    },
    [commands, fileId, queryClient],
  );

  // Back to the folder the file is in; someone it was shared with on its own cannot open that
  // folder, so they go back to what was shared with them.
  const close = async () => {
    const { parentId } = file;
    if (!parentId) return navigate({ to: file.owned ? "/" : "/shared" });
    const folder = await queryClient.fetchQuery(queries.folder(parentId)).catch(() => null);
    return folder
      ? navigate({ to: "/folders/$folderId", params: { folderId: parentId } })
      : navigate({ to: "/shared" });
  };
  useReportTitle(node?.name ?? file.name);
  const { actions, onRename, dialogs } = useFileActions({ node, onClose: () => void close(), onRestored });
  const createFile = async (name: string, bytes: Uint8Array, type: string) => {
    const created = await commands.upload(
      file.owned ? file.parentId : null,
      new File([bytes as BlobPart], name, { type }),
    );
    await refreshFiles(queryClient);
    return created.name;
  };

  if (isLegacyFile({ kind: "file", name: file.name })) {
    return <ConvertPage file={file} name={node?.name ?? file.name} onClose={() => void close()} />;
  }
  const editor = editorOf(kindOf({ kind: "file", name: file.name }));
  if (!editor) return <Failure message="Diese Datei kann Schreibzeug noch nicht bearbeiten." />;
  const View = VIEWS[editor];
  return (
    <>
      <View
        file={file}
        fileId={fileId}
        name={node?.name ?? file.name}
        onSave={store}
        fileActions={actions}
        onRename={onRename}
        onCreateFile={createFile}
        folderId={file.owned ? file.parentId : null}
        onReplace={async (bytes) => {
          await store(bytes);
          onRestored();
        }}
      />
      {dialogs}
    </>
  );
};
