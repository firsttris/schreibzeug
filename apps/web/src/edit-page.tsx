import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { messageOf } from "./api/client";
import { useFiles } from "./api/context";
import { refreshFiles } from "./api/files";
import { EditorView } from "./editor-view";
import type { OpenedFile } from "./files";

/**
 * The file as the editor opened it. Kept outside the "files" keys on purpose: refreshing the file
 * lists after a save must not hand the editor new bytes and reopen the document.
 */
const openedKey = (id: string) => ["opened", id] as const;

/** Loads a file from the server into the editor and saves it back as a new version. */
export const EditPage = ({ fileId }: { fileId: string }) => {
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const opened = useQuery({
    queryKey: openedKey(fileId),
    queryFn: async (): Promise<OpenedFile & { parentId: string | null }> => {
      const [node, bytes] = await Promise.all([
        queryClient.fetchQuery(queries.node(fileId)),
        commands.content(fileId),
      ]);
      return { name: node.name, parentId: node.parentId, bytes };
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (opened.isPending) {
    return (
      <p role="status" className="m-0 p-8 text-sm text-[var(--muted-foreground)]">
        Lädt …
      </p>
    );
  }
  if (opened.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
        <p className="m-0">{messageOf(opened.error)}</p>
        <Link to="/">Zu meinen Dateien</Link>
      </div>
    );
  }

  const { parentId } = opened.data;
  return (
    <EditorView
      file={opened.data}
      onClose={() =>
        parentId
          ? navigate({ to: "/folders/$folderId", params: { folderId: parentId } })
          : navigate({ to: "/" })
      }
      onSave={async (bytes) => {
        await commands.save(fileId, bytes);
        await refreshFiles(queryClient);
      }}
    />
  );
};
