import type { FileNode } from "@stapel/files-api";
import { FolderInput, History, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { Button } from "../ui/button";
import { MoveDialog } from "./move-dialog";
import { NameDialog } from "./name-dialog";
import { VersionsDialog } from "./versions-dialog";

/** Rename, move, versions (files) and trash for one row, with the dialogs they need. */
export const NodeActions = ({ node }: { node: FileNode }) => {
  const { commands } = useFiles();
  const [dialog, setDialog] = useState<"rename" | "move" | "versions" | null>(null);
  const close = () => setDialog(null);
  const rename = useFileMutation((name: string) => commands.update(node.id, { name }));
  const trash = useFileMutation(() => commands.trash(node.id));

  return (
    <>
      <Button variant="ghost" aria-label={`${node.name} umbenennen`} onClick={() => setDialog("rename")}>
        <Pencil size={15} />
      </Button>
      <Button variant="ghost" aria-label={`${node.name} verschieben`} onClick={() => setDialog("move")}>
        <FolderInput size={15} />
      </Button>
      {node.kind === "file" && (
        <Button
          variant="ghost"
          aria-label={`Versionen von ${node.name}`}
          onClick={() => setDialog("versions")}
        >
          <History size={15} />
        </Button>
      )}
      <Button
        variant="ghost"
        aria-label={`${node.name} in den Papierkorb`}
        disabled={trash.isPending}
        onClick={() => trash.mutate([])}
      >
        <Trash2 size={15} />
      </Button>
      <NameDialog
        open={dialog === "rename"}
        title="Umbenennen"
        label="Neuer Name"
        initialName={node.name}
        confirm="Umbenennen"
        onSubmit={(name) => rename.mutateAsync([name])}
        onClose={close}
      />
      <MoveDialog node={node} open={dialog === "move"} onClose={close} />
      {node.kind === "file" && <VersionsDialog file={node} open={dialog === "versions"} onClose={close} />}
    </>
  );
};
