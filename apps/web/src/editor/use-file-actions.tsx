import type { OfficeFormat } from "@schreibzeug/editor-core";
import type { FileNode } from "@schreibzeug/files-api";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { isApiFailure } from "../api/client";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { NameDialog } from "../files/name-dialog";
import { ShareDialog } from "../files/share-dialog";
import { VersionsDialog } from "../files/versions-dialog";
import type { FileActions } from "./file-menu";

const NEW_FILE: Record<OfficeFormat, { title: string; label: string; name: string }> = {
  docx: { title: "Neues Dokument", label: "Name des Dokuments", name: "Unbenanntes Dokument" },
  xlsx: { title: "Neue Tabelle", label: "Name der Tabelle", name: "Unbenannte Tabelle" },
  pptx: { title: "Neue Präsentation", label: "Name der Präsentation", name: "Unbenannte Präsentation" },
};

/** Opens a file in a new tab, so the open document stays where it is. */
const openInNewTab = (id: string) => window.open(`/edit/${id}`, "_blank", "noopener");

type Dialog = "versions" | "share" | OfficeFormat | null;

export type FileActionsHandle = {
  actions: FileActions;
  onRename: ((name: string) => Promise<unknown>) | undefined;
  /** The dialogs the actions open; render them once on the page. */
  dialogs: ReactNode;
};

/**
 * What the "Datei" menu does on the server, as far as the user's role allows: renaming needs
 * "edit", sharing is the owner's. A new file goes next to this one when the user may add there,
 * otherwise into their own files.
 */
export const useFileActions = ({
  node,
  onClose,
  onRestored,
}: {
  node: FileNode | undefined;
  onClose: () => void;
  onRestored: () => void;
}): FileActionsHandle => {
  const { commands, info } = useFiles();
  // Files on this computer have no one to share with and no versions to go back to.
  const server = info.mode === "server";
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const createNew = async (format: OfficeFormat, name: string) => {
    const parentId = node && node.role !== "view" ? node.parentId : null;
    const created = await commands.createBlank(parentId, name, format).catch((error: unknown) => {
      // The folder may be one the user cannot add to (a file shared on its own): use their own files.
      if (parentId !== null && isApiFailure(error) && (error.status === 403 || error.status === 404))
        return commands.createBlank(null, name, format);
      throw error;
    });
    await refreshFiles(queryClient);
    openInNewTab(created.id);
  };

  const actions: FileActions = {
    onNew: (format) => setDialog(format),
    onCopy: () => {
      if (!node) return;
      void commands.copy(node.id).then(async (copy) => {
        await refreshFiles(queryClient);
        openInNewTab(copy.id);
      });
    },
    onShare: server && node?.role === "owner" ? () => setDialog("share") : undefined,
    onShowVersions: server && node ? () => setDialog("versions") : undefined,
    onClose,
  };

  const onRename =
    node && node.role !== "view"
      ? async (name: string) => {
          await commands.update(node.id, { name });
          await refreshFiles(queryClient);
        }
      : undefined;

  const dialogs = (
    <>
      {(Object.keys(NEW_FILE) as OfficeFormat[]).map((format) => (
        <NameDialog
          key={format}
          open={dialog === format}
          title={NEW_FILE[format].title}
          label={NEW_FILE[format].label}
          initialName={NEW_FILE[format].name}
          confirm="Anlegen und öffnen"
          onSubmit={(name) => createNew(format, name)}
          onClose={close}
        />
      ))}
      {server && node && (
        <VersionsDialog file={node} open={dialog === "versions"} onClose={close} onRestored={onRestored} />
      )}
      {server && node?.role === "owner" && (
        <ShareDialog node={node} open={dialog === "share"} onClose={close} />
      )}
    </>
  );

  return { actions, onRename, dialogs };
};
