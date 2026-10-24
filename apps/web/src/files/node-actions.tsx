import type { FileNode } from "@stapel/files-api";
import { FolderInput, History, Pencil, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { Button } from "../ui/button";
import { MoveDialog } from "./move-dialog";
import { NameDialog } from "./name-dialog";
import { ShareDialog } from "./share-dialog";
import { VersionsDialog } from "./versions-dialog";

type ActionDialog = "rename" | "move" | "versions" | "share";

/**
 * What one row offers, as far as the user's role allows: renaming needs "edit"; sharing, moving
 * and the trash are the owner's (as the server decides, files/access.ts). Versions are for everyone
 * who may look; restoring one needs "edit" (versions-dialog.tsx).
 */
export const NodeActions = ({ node }: { node: FileNode }) => {
  const { commands } = useFiles();
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const close = () => setDialog(null);
  const rename = useFileMutation((name: string) => commands.update(node.id, { name }));
  const trash = useFileMutation(() => commands.trash(node.id));
  const owner = node.role === "owner";
  const editor = node.role !== "view";

  return (
    <>
      {owner && (
        <Button variant="ghost" aria-label={`${node.name} teilen`} onClick={() => setDialog("share")}>
          <Share2 size={15} />
        </Button>
      )}
      {editor && (
        <Button variant="ghost" aria-label={`${node.name} umbenennen`} onClick={() => setDialog("rename")}>
          <Pencil size={15} />
        </Button>
      )}
      {owner && (
        <Button variant="ghost" aria-label={`${node.name} verschieben`} onClick={() => setDialog("move")}>
          <FolderInput size={15} />
        </Button>
      )}
      {node.kind === "file" && (
        <Button
          variant="ghost"
          aria-label={`Versionen von ${node.name}`}
          onClick={() => setDialog("versions")}
        >
          <History size={15} />
        </Button>
      )}
      {owner && (
        <Button
          variant="ghost"
          aria-label={`${node.name} in den Papierkorb`}
          disabled={trash.isPending}
          onClick={() => trash.mutate([])}
        >
          <Trash2 size={15} />
        </Button>
      )}
      <NameDialog
        open={dialog === "rename"}
        title="Umbenennen"
        label="Neuer Name"
        initialName={node.name}
        confirm="Umbenennen"
        onSubmit={(name) => rename.mutateAsync([name])}
        onClose={close}
      />
      {owner && <MoveDialog node={node} open={dialog === "move"} onClose={close} />}
      {owner && <ShareDialog node={node} open={dialog === "share"} onClose={close} />}
      {node.kind === "file" && <VersionsDialog file={node} open={dialog === "versions"} onClose={close} />}
    </>
  );
};
