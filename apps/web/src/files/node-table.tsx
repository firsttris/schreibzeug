import type { FileNode } from "@schreibzeug/files-api";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useFiles } from "../api/context";
import { formatChanged, formatSize, isEditable, kindOf } from "../lib/format";
import { FileBadge } from "./file-badge";

export type NodeTableProps<N extends FileNode> = {
  nodes: N[];
  /** The buttons at the end of a row, shown on hover and focus. */
  actions: (node: N) => ReactNode;
  /** A second line under the name, e.g. who shared it. */
  detail?: (node: N) => ReactNode;
  /** Nodes in the trash are listed, not opened. */
  openable?: boolean;
  empty: ReactNode;
};

const NodeName = ({ node, openable }: { node: FileNode; openable: boolean }) => {
  const { commands } = useFiles();
  const className = "truncate font-medium text-[var(--foreground)] no-underline hover:underline";
  if (!openable) return <span className="truncate font-medium">{node.name}</span>;
  if (node.kind === "folder") {
    return (
      <Link to="/folders/$folderId" params={{ folderId: node.id }} className={className}>
        {node.name}
      </Link>
    );
  }
  if (isEditable(node)) {
    return (
      <Link to="/edit/$fileId" params={{ fileId: node.id }} className={className}>
        {node.name}
      </Link>
    );
  }
  return (
    <a href={commands.contentUrl(node.id)} download={node.name} className={className}>
      {node.name}
    </a>
  );
};

/** Folders and files as a table: name, last change, size, and the row's actions. */
export const NodeTable = <N extends FileNode>({
  nodes,
  actions,
  detail,
  openable = true,
  empty,
}: NodeTableProps<N>) => {
  if (nodes.length === 0)
    return <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">{empty}</div>;
  return (
    <table className="w-full table-fixed border-collapse text-sm" data-testid="node-table">
      <thead>
        <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
          <th className="py-2 pl-2 font-medium">Name</th>
          <th className="hidden w-40 py-2 font-medium sm:table-cell">Geändert</th>
          <th className="hidden w-24 py-2 text-right font-medium sm:table-cell">Größe</th>
          <th className="w-48 py-2">
            <span className="sr-only">Aktionen</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node) => (
          <tr
            key={node.id}
            data-node={node.name}
            className="group border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/60"
          >
            <td className="py-2 pl-2">
              <span className="flex min-w-0 items-center gap-3">
                <FileBadge kind={kindOf(node)} />
                <span className="flex min-w-0 flex-col">
                  <NodeName node={node} openable={openable} />
                  {detail && (
                    <span className="truncate text-xs text-[var(--muted-foreground)]">{detail(node)}</span>
                  )}
                </span>
              </span>
            </td>
            <td className="hidden py-2 text-[var(--muted-foreground)] sm:table-cell">
              {formatChanged(node.trashedAt ?? node.updatedAt)}
            </td>
            <td className="hidden py-2 text-right text-[var(--muted-foreground)] tabular-nums sm:table-cell">
              {node.kind === "folder" ? "–" : formatSize(node.size)}
            </td>
            <td className="py-2 pr-2">
              <span className="flex justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {actions(node)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
