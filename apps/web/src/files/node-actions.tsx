import type { FileNode } from "@stapel/files-api";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { Button } from "../ui/button";
import { NameDialog } from "./name-dialog";

/** Rename and trash for one row, with the dialog that rename needs. */
export const NodeActions = ({ node }: { node: FileNode }) => {
  const { commands } = useFiles();
  const [renaming, setRenaming] = useState(false);
  const rename = useFileMutation((name: string) => commands.update(node.id, { name }));
  const trash = useFileMutation(() => commands.trash(node.id));

  return (
    <>
      <Button variant="ghost" aria-label={`${node.name} umbenennen`} onClick={() => setRenaming(true)}>
        <Pencil size={15} />
      </Button>
      <Button
        variant="ghost"
        aria-label={`${node.name} in den Papierkorb`}
        disabled={trash.isPending}
        onClick={() => trash.mutate([])}
      >
        <Trash2 size={15} />
      </Button>
      <NameDialog
        open={renaming}
        title="Umbenennen"
        label="Neuer Name"
        initialName={node.name}
        confirm="Umbenennen"
        onSubmit={(name) => rename.mutateAsync([name])}
        onClose={() => setRenaming(false)}
      />
    </>
  );
};
