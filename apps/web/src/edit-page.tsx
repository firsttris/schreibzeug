import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useFiles } from "./api/context";
import { refreshFiles } from "./api/files";
import { EditorView } from "./editor-view";
import { VersionsDialog } from "./files/versions-dialog";
import { useSessionFile } from "./use-session-file";

/** Opens a file from the server in its editing session and saves it back as a new version. */
export const EditPage = ({ fileId }: { fileId: string }) => {
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [versionsOpen, setVersionsOpen] = useState(false);
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
  if (opened.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
        <p className="m-0">{opened.message}</p>
        <Link to="/">Zu meinen Dateien</Link>
      </div>
    );
  }

  const { parentId } = opened.file;
  return (
    <>
      <EditorView
        file={opened.file}
        onClose={() =>
          parentId
            ? navigate({ to: "/folders/$folderId", params: { folderId: parentId } })
            : navigate({ to: "/" })
        }
        onSave={async (bytes) => {
          await commands.save(fileId, bytes);
          await refreshFiles(queryClient);
        }}
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
