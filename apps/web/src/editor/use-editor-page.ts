import type { FileNode } from "@schreibzeug/files-api";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { useReportTitle } from "../embed/bridge";
import { useFileActions } from "./use-file-actions";

/**
 * What every editor page does around its editor: the tab's title, the "Datei" menu's actions,
 * going back, and storing a new file beside the open one.
 */
export const useEditorPage = ({
  name,
  node,
  parentId,
  owned,
  onRestored,
}: {
  /** The name the file had when it was opened; the node's, once known, wins. */
  name: string;
  node: FileNode | undefined;
  parentId: string | null;
  owned: boolean;
  onRestored: () => void;
}) => {
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Back to the folder the file is in; someone it was shared with on its own cannot open that
  // folder, so they go back to what was shared with them.
  const close = async () => {
    if (!parentId) return navigate({ to: owned ? "/" : "/shared" });
    const folder = await queryClient.fetchQuery(queries.folder(parentId)).catch(() => null);
    return folder
      ? navigate({ to: "/folders/$folderId", params: { folderId: parentId } })
      : navigate({ to: "/shared" });
  };
  useReportTitle(node?.name ?? name);
  const { actions, onRename, dialogs } = useFileActions({ node, onClose: () => void close(), onRestored });

  /** Stores a new file beside this one (in "Meine Dateien" when the folder is someone else's). */
  const createFile = async (fileName: string, bytes: Uint8Array, type: string) => {
    const created = await commands.upload(
      owned ? parentId : null,
      new File([bytes as BlobPart], fileName, { type }),
    );
    await refreshFiles(queryClient);
    return created;
  };

  return { close, actions, onRename, dialogs, createFile };
};
