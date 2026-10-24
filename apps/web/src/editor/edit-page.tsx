import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ComponentType, useCallback, useState } from "react";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { VersionsDialog } from "../files/versions-dialog";
import { kindOf } from "../lib/format";
import type { EditorViewProps } from "./props";
import { SheetView } from "./sheet-view";
import { SlideView } from "./slide-view";
import { useSessionFile } from "./use-session-file";
import { WordView } from "./word-view";

/** The editor view for each kind of file Stapel opens (lib/format.ts isEditable). */
const VIEWS: Partial<Record<ReturnType<typeof kindOf>, ComponentType<EditorViewProps>>> = {
  docx: WordView,
  xlsx: SheetView,
  pptx: SlideView,
};

/** Opens a file from the server in its editing session and saves it back as a new version. */
export const EditPage = ({ fileId }: { fileId: string }) => {
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const node = useQuery(queries.node(fileId));
  const opened = useSessionFile(fileId, generation);
  const store = useCallback(
    async (bytes: Uint8Array) => {
      await commands.save(fileId, bytes);
      await refreshFiles(queryClient);
    },
    [commands, fileId, queryClient],
  );

  if (opened.status === "loading") {
    return (
      <p role="status" className="m-0 p-8 text-sm text-[var(--muted-foreground)]">
        Lädt …
      </p>
    );
  }
  if (opened.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
        <p className="m-0">{opened.message}</p>
        <Link to="/">Zu meinen Dateien</Link>
      </div>
    );
  }

  const { parentId } = opened.file;
  // Back to the folder the file is in; someone it was shared with on its own cannot open that
  // folder, so they go back to what was shared with them.
  const close = async () => {
    if (!parentId) return navigate({ to: opened.file.owned ? "/" : "/shared" });
    const folder = await queryClient.fetchQuery(queries.folder(parentId)).catch(() => null);
    return folder
      ? navigate({ to: "/folders/$folderId", params: { folderId: parentId } })
      : navigate({ to: "/shared" });
  };
  const View = VIEWS[kindOf({ kind: "file", name: opened.file.name })];
  if (!View) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
        <p className="m-0">Diese Datei kann Stapel noch nicht bearbeiten.</p>
        <Link to="/">Zu meinen Dateien</Link>
      </div>
    );
  }
  return (
    <>
      <View
        file={opened.file}
        onClose={() => void close()}
        onSave={store}
        onShowVersions={() => setVersionsOpen(true)}
      />
      {node.data && (
        <VersionsDialog
          file={node.data}
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          // The restored version becomes the newest; open it in place of what the editor shows.
          onRestored={() => setGeneration((current) => current + 1)}
        />
      )}
    </>
  );
};
