import type { FileNode } from "@schreibzeug/files-api";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { NodeTable } from "./node-table";
import { PageHeader, PageMessage } from "./page";

const RestoreButton = ({ node }: { node: FileNode }) => {
  const { commands } = useFiles();
  const restore = useFileMutation(() => commands.restore(node.id));
  return (
    <span className="flex items-center gap-2">
      {restore.isError && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {messageOf(restore.error)}
        </span>
      )}
      <Button
        variant="ghost"
        aria-label={m.trash_page_restore({ name: node.name })}
        disabled={restore.isPending}
        onClick={() => restore.mutate([])}
      >
        <RotateCcw size={15} />
      </Button>
    </span>
  );
};

/** What was moved to the trash, newest first, and the way back. */
export const TrashPage = () => {
  const { queries } = useFiles();
  const trash = useQuery(queries.trash());
  return (
    <section className="flex flex-col gap-4" aria-label={m.trash_page_title()}>
      <PageHeader title={m.trash_page_title()} />
      {trash.isPending && <PageMessage>{m.trash_page_loading()}</PageMessage>}
      {trash.isError && <PageMessage tone="error">{messageOf(trash.error)}</PageMessage>}
      {trash.data && (
        <NodeTable
          nodes={trash.data}
          openable={false}
          actions={(node) => <RestoreButton node={node} />}
          empty={m.trash_page_empty()}
        />
      )}
    </section>
  );
};
