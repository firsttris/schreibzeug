import type { FileNode } from "@schreibzeug/files-api";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import { messageOf } from "../api/client";
import { rootLabel, useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type MoveDialogProps = { node: FileNode; open: boolean; onClose: () => void };

/** Picks a target folder by walking the tree from where the node is, then moves it there. */
export const MoveDialog = ({ node, open, onClose }: MoveDialogProps) => (
  <Dialog open={open} title={`${node.name} verschieben`} onClose={onClose}>
    {open && <FolderPicker node={node} onClose={onClose} />}
  </Dialog>
);

const FolderPicker = ({ node, onClose }: { node: FileNode; onClose: () => void }) => {
  const { queries, commands, info } = useFiles();
  const [folderId, setFolderId] = useState<string | null>(node.parentId);
  const listing = useQuery(queries.folder(folderId));
  const move = useFileMutation((parentId: string | null) => commands.update(node.id, { parentId }));

  const parentOfShown = listing.data?.folder?.parentId ?? null;
  // A folder cannot go into itself; it is left out of the choices.
  const folders = (listing.data?.children ?? []).filter(
    (child) => child.kind === "folder" && child.id !== node.id,
  );
  const here = listing.data?.folder?.name ?? rootLabel(info);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 text-sm">
        {folderId !== null && (
          <Button variant="ghost" aria-label="Eine Ebene höher" onClick={() => setFolderId(parentOfShown)}>
            <ChevronLeft size={16} />
          </Button>
        )}
        <span className="truncate font-medium" data-testid="move-target">
          {here}
        </span>
      </div>
      <ul className="m-0 flex max-h-64 min-h-24 list-none flex-col overflow-y-auto rounded-md border border-[var(--border)] p-1">
        {listing.isPending && <li className="p-2 text-sm text-[var(--muted-foreground)]">Lädt …</li>}
        {listing.data && folders.length === 0 && (
          <li className="p-2 text-sm text-[var(--muted-foreground)]">Keine Unterordner</li>
        )}
        {folders.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              aria-label={`Ordner ${folder.name} öffnen`}
              onClick={() => setFolderId(folder.id)}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)]"
            >
              <Folder size={16} className="shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              <span className="flex-1 truncate">{folder.name}</span>
              <ChevronRight size={14} className="text-[var(--muted-foreground)]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {move.isError && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {messageOf(move.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={folderId === node.parentId || move.isPending}
          onClick={async () => {
            await move.mutateAsync([folderId]);
            onClose();
          }}
        >
          Hierher verschieben
        </Button>
      </div>
    </div>
  );
};
